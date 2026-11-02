// The live workout: one exercise per page, big steppers, rest timer, summary.
import { store } from '../store.js';
import { h, ic, haptic, chime, unlockAudio, keepAwake, repeatPress, afterTransition } from '../ui.js';
import { sheet, keypad, confirm, actions, editText, toast } from '../sheets.js';
import * as f from '../fmt.js';
import { makeItem, newWorkout, e1rm, exHistory, exName } from '../logic.js';
import { pickExercise } from './picker.js';
import { sessionView } from './session.js';

let layer, mini, pager, segsEl, clockEl, restBar, restFill, restTime, restLabel, miniClock, miniRest;
let pages = [];
let isOpen = false;
let scrollTimer = 0;

const A = () => store.active;
const save = () => store.saveActive();
const exOf = (it) => store.data.exercises[it.exId] || { name: 'Deleted exercise', primary: [], secondary: [], rest: 120, notes: '' };
const restOf = (it) => exOf(it).rest ?? store.settings.restDefault;
const rirText = (v) => (v === 4 ? '4+' : String(v));

export const workoutOpen = () => isOpen;

export function initWorkout() {
  layer = document.getElementById('workout');
  mini = document.getElementById('mini');
  mini.addEventListener('click', () => openWorkout());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (A()) keepAwake(true);
    tick();
    if (A()?.rest) renderRest();
  });
  store.on((what) => {
    if (what === 'all' && !A()) { closeLayer(); hideMini(); }
  });
  setInterval(tick, 500);
  if (A()) {
    if (Date.now() - A().startedAt < 5 * 3600e3) openWorkout(false);
    else showMini();
  }
}

export async function startWorkout(day) {
  unlockAudio();
  if (A()) {
    const ok = await confirm({
      title: 'Workout in progress',
      message: `Discard ${A().dayName} and start ${day ? day.name : 'an empty workout'}?`,
      ok: 'Discard and start', danger: true,
    });
    if (!ok) return;
  }
  store.active = newWorkout(day);
  save();
  openWorkout(true);
  store.emit('active');
}

export function openWorkout(animate = true) {
  if (!A()) return;
  build();
  layer.classList.toggle('instant', !animate);
  layer.classList.add('open');
  isOpen = true;
  hideMini();
  keepAwake(true);
  requestAnimationFrame(() => {
    goTo(A().page || 0, false);
    layer.classList.remove('instant');
  });
}

function minimize() {
  haptic();
  closeLayer();
  showMini();
}

function closeLayer() {
  if (!layer.classList.contains('open')) return;
  layer.classList.remove('open');
  isOpen = false;
  afterTransition(layer, 500, () => { if (!isOpen) layer.textContent = ''; });
  store.emit('active');
}

// ---------- layout

function iconBtn(name, onClick, label, size = 24) {
  const b = h('button', { class: 'icon-btn', 'aria-label': label }, ic(name, size));
  b.addEventListener('click', onClick);
  return b;
}

function build() {
  const a = A();
  layer.textContent = '';
  clockEl = h('div', { class: 'wk-clock' });
  const finishBtn = h('button', { class: 'btn pill', text: 'Finish' });
  finishBtn.addEventListener('click', finish);
  const head = h('header', { class: 'wk-head' },
    iconBtn('chevD', minimize, 'Minimize'),
    h('div', { class: 'wk-title' }, h('div', { class: 'eyebrow', text: a.dayName }), clockEl),
    finishBtn);
  segsEl = h('button', { class: 'wk-segs', 'aria-label': 'All exercises' });
  segsEl.addEventListener('click', overview);
  pager = h('div', { class: 'wk-pager' });
  pages = a.items.map((_, i) => buildPage(i));
  pages.forEach((p) => pager.append(p.el));
  if (!a.items.length) pager.append(emptyPage());
  restBar = buildRest();
  layer.append(h('div', { class: 'wk-body' }, head, segsEl, pager, restBar));
  pager.addEventListener('scroll', onScroll, { passive: true });
  renderSegs(true);
  renderRest();
  tick();
}

function emptyPage() {
  const add = h('button', { class: 'btn primary', text: 'Add exercise' });
  add.addEventListener('click', addExercise);
  return h('section', { class: 'wk-page is-empty' }, h('div', { class: 'wk-empty' },
    h('div', { class: 'eyebrow', text: 'Empty workout' }),
    h('p', { text: 'Add exercises as you go.' }), add));
}

function buildPage(i) {
  const a = A(), it = a.items[i], ex = exOf(it);
  const p = { i, el: h('section', { class: 'wk-page' }) };
  const kindIcon = { up: 'up', down: 'down', hold: 'flat', beat: 'bolt', new: 'plus' }[it.coach?.kind] || 'bolt';
  const last = exHistory(it.exId)[0];

  p.setsEl = h('div', { class: 'wk-sets' });
  const scroll = h('div', { class: 'wk-scroll' },
    h('div', { class: 'wk-top' },
      h('div', { class: 'wk-top-text' },
        h('div', { class: 'eyebrow', text: `${i + 1} of ${a.items.length}` }),
        h('h2', { class: 'wk-name', text: ex.name })),
      iconBtn('more', () => exerciseMenu(i), 'Exercise options')),
    h('div', { class: 'wk-meta', text: `${f.setsLabel(it.target)} ${it.target.sets === 1 ? 'set' : 'sets'} · ${f.range(it.target)} reps · ${f.clock(restOf(it))} rest` }),
    store.settings.coach && it.coach ? h('div', { class: 'wk-coach ' + it.coach.kind }, ic(kindIcon, 16), h('span', { text: it.coach.msg })) : null,
    last ? h('div', { class: 'wk-last', text: `Last · ${f.rel(last.session.startedAt)} · ${last.sets.map((s) => f.setText(s, ex)).join(', ')}` }) : null,
    ex.notes ? h('div', { class: 'wk-note' }, ic('note', 15), h('span', { text: ex.notes })) : null,
    p.setsEl);

  // steppers
  p.wNum = h('button', { class: 'step-num' });
  p.rNum = h('button', { class: 'step-num' });
  const wDec = h('button', { class: 'step-btn', 'aria-label': 'Less weight' }, ic('chevL', 30));
  const wInc = h('button', { class: 'step-btn', 'aria-label': 'More weight' }, ic('chevR', 30));
  const rDec = h('button', { class: 'step-btn', 'aria-label': 'Fewer reps' }, ic('chevL', 30));
  const rInc = h('button', { class: 'step-btn', 'aria-label': 'More reps' }, ic('chevR', 30));
  repeatPress(wDec, () => nudgeW(p, -1));
  repeatPress(wInc, () => nudgeW(p, 1));
  repeatPress(rDec, () => nudgeR(p, -1));
  repeatPress(rInc, () => nudgeR(p, 1));
  p.wNum.addEventListener('click', () => {
    const s = selSet(p);
    if (!s) return;
    keypad({ label: ex.bodyweight ? `Added weight (${f.unit()})` : `Weight (${f.unit()})`, value: f.round2(f.toDisp(s.w || 0)), suffix: f.unit(), onDone: (v) => setW(p, v, 0) });
  });
  p.rNum.addEventListener('click', () => {
    const s = selSet(p);
    if (!s) return;
    keypad({ label: 'Reps', value: s.r, decimal: false, onDone: (v) => setR(p, Math.round(v), 0) });
  });
  const wRow = h('div', { class: 'stepper' }, wDec, h('div', { class: 'step-mid' }, p.wNum, h('div', { class: 'step-label', text: ex.bodyweight ? `added ${f.unit()}` : f.unit() })), wInc);
  const rRow = h('div', { class: 'stepper' }, rDec, h('div', { class: 'step-mid' }, p.rNum, h('div', { class: 'step-label', text: `reps · ${f.range(it.target)}` })), rInc);

  p.rirBtns = [];
  const rir = store.settings.rir ? h('div', { class: 'rir' }, h('span', { class: 'rir-label', text: 'RIR' }),
    [0, 1, 2, 3, 4].map((v) => {
      const b = h('button', { class: 'rir-btn', text: rirText(v) });
      b.addEventListener('click', () => {
        const s = selSet(p);
        if (!s) return;
        s.rir = s.rir === v ? null : v;
        haptic();
        save();
        renderPage(p);
      });
      p.rirBtns.push(b);
      return b;
    })) : null;

  p.go = h('button', { class: 'btn primary block big wk-go' });
  p.go.addEventListener('click', () => complete(p));
  const ctl = h('div', { class: 'wk-ctl' }, wRow, rRow, rir, p.go);

  // shown once every set is logged
  p.doneText = h('div', { class: 'wk-done-text' });
  p.nextBtn = h('button', { class: 'btn primary block big' });
  const addSetBtn = h('button', { class: 'btn ghost block', text: 'Add a set' });
  addSetBtn.addEventListener('click', () => addSet(i));
  p.nextBtn.addEventListener('click', () => {
    const n = nextOpen(i);
    if (n == null) finish();
    else goTo(n);
  });
  const done = h('div', { class: 'wk-done' }, h('div', { class: 'wk-done-mark' }, ic('check', 28)), p.doneText, h('div', { class: 'wk-done-btns' }, addSetBtn, p.nextBtn));

  p.el.append(scroll, h('div', { class: 'wk-controls' }, ctl, done));
  renderPage(p);
  return p;
}

const selSet = (p) => {
  const it = A().items[p.i];
  return it.sel >= 0 ? it.sets[it.sel] : null;
};

function renderPage(p) {
  const it = A().items[p.i], ex = exOf(it);
  if (it.sel >= it.sets.length) it.sel = it.sets.findIndex((s) => !s.done);
  p.setsEl.textContent = '';
  it.sets.forEach((s, j) => {
    const optional = j >= it.target.setsMin;
    const row = h('button', { class: 'set-row' + (s.done ? ' done' : '') + (j === it.sel ? ' sel' : '') + (j === p.just ? ' just' : '') },
      h('span', { class: 'sr-i', text: String(j + 1) }),
      h('span', { class: 'sr-v', text: f.setText(s, ex) }),
      s.done && s.rir != null ? h('span', { class: 'sr-tag', text: `RIR ${rirText(s.rir)}` }) : null,
      !s.done && optional ? h('span', { class: 'sr-tag', text: 'optional' }) : null,
      s.pr ? h('span', { class: 'badge sm', text: 'PR' }) : null,
      h('span', { class: 'sr-check' }, s.done ? ic('check', 16) : null));
    row.addEventListener('click', () => {
      it.sel = it.sel === j && s.done ? it.sets.findIndex((x) => !x.done) : j;
      haptic();
      save();
      renderPage(p);
    });
    p.setsEl.append(row);
  });
  p.just = -1;

  const s = selSet(p);
  p.el.classList.toggle('complete', !s);
  if (s) {
    setNum(p.wNum, f.w(s.w));
    setNum(p.rNum, String(s.r ?? 0));
    p.rirBtns.forEach((b, v) => b.classList.toggle('on', s.rir === v));
    p.go.textContent = s.done ? `Update set ${it.sel + 1}` : `Complete set ${it.sel + 1}`;
    p.go.classList.toggle('ghosted', s.done);
  } else {
    const logged = it.sets.filter((x) => x.done);
    p.doneText.textContent = it.skipped && !logged.length ? 'Skipped' : logged.map((x) => f.setText(x, ex)).join('  ·  ');
    const n = nextOpen(p.i);
    p.nextBtn.textContent = n == null ? 'Finish workout' : `Next · ${exName(A().items[n].exId)}`;
  }
}

function setNum(el, text, dir = 0) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (!dir) return;
  el.classList.remove('bump-up', 'bump-down');
  void el.offsetWidth;
  el.classList.add(dir > 0 ? 'bump-up' : 'bump-down');
}

function setW(p, disp, dir) {
  const it = A().items[p.i], s = selSet(p);
  if (!s) return;
  const kg = f.fromDisp(Math.max(0, f.round2(disp)));
  s.w = kg;
  if (!s.done) for (let j = it.sel + 1; j < it.sets.length; j++) if (!it.sets[j].done) it.sets[j].w = kg;
  save();
  setNum(p.wNum, f.w(kg), dir);
  renderPage(p);
}

function nudgeW(p, dir) {
  const s = selSet(p);
  if (!s) return;
  setW(p, f.round2(f.toDisp(s.w || 0)) + dir * f.step(exOf(A().items[p.i])), dir);
}

function setR(p, r, dir) {
  const s = selSet(p);
  if (!s) return;
  s.r = Math.max(0, Math.min(999, r));
  save();
  setNum(p.rNum, String(s.r), dir);
  renderPage(p);
}

const nudgeR = (p, dir) => { const s = selSet(p); if (s) setR(p, (s.r || 0) + dir, dir); };

function nextOpen(i) {
  const items = A().items;
  for (let k = 1; k <= items.length; k++) {
    const j = (i + k) % items.length;
    if (j === i) break;
    const it = items[j];
    if (!it.skipped && it.sets.some((s) => !s.done)) return j;
  }
  return null;
}

function complete(p) {
  unlockAudio();
  const it = A().items[p.i], s = selSet(p);
  if (!s) return;
  const first = !s.done;
  s.done = true;
  s.at ||= Date.now();
  haptic();
  if (first) {
    const e = e1rm(s.w, s.r);
    if (it.best.e1rm > 0 && e > it.best.e1rm + 1e-6) {
      s.pr = true;
      it.best.e1rm = e;
      toast(`New record · ${f.setText(s, exOf(it))} · est. 1RM ${f.wu1(e)}`);
    }
    startRest(restOf(it));
    p.just = it.sel;
  }
  it.sel = it.sets.findIndex((x) => !x.done);
  save();
  renderPage(p);
  renderSegs();
  if (first && it.sel === -1) {
    const n = nextOpen(p.i);
    if (n != null) setTimeout(() => { if (isOpen && currentIndex() === p.i) goTo(n); }, 700);
  }
}

// ---------- paging & progress segments

const currentIndex = () => (pager ? Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth)) : 0);

function goTo(i, smooth = true) {
  if (!pager) return;
  pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

function onScroll() {
  const i = currentIndex();
  if (i === A()?.page) return;
  A().page = i;
  renderSegs();
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(save, 300);
}

function renderSegs(rebuild = false) {
  const items = A().items;
  if (rebuild || segsEl.children.length !== items.length) {
    segsEl.textContent = '';
    items.forEach(() => segsEl.append(h('span', { class: 'seg-bar' }, h('i'))));
  }
  const cur = currentIndex();
  items.forEach((it, i) => {
    const bar = segsEl.children[i];
    const done = it.sets.filter((s) => s.done).length;
    bar.classList.toggle('cur', i === cur);
    bar.classList.toggle('skipped', !!it.skipped);
    bar.firstChild.style.transform = `scaleX(${it.sets.length ? done / it.sets.length : 0})`;
  });
}

// ---------- rest timer

function buildRest() {
  restFill = h('div', { class: 'rest-fill' });
  restLabel = h('span', { class: 'rest-label', text: 'Rest' });
  restTime = h('span', { class: 'rest-time' });
  const b = (text, fn) => { const x = h('button', { class: 'rest-btn', text }); x.addEventListener('click', () => { haptic(); fn(); }); return x; };
  return h('div', { class: 'wk-rest' },
    h('div', { class: 'rest-track' }, restFill),
    h('div', { class: 'rest-row' }, restLabel, restTime,
      h('div', { class: 'rest-actions' }, b('−15', () => adjustRest(-15)), b('+15', () => adjustRest(15)), b('Skip', skipRest))));
}

function startRest(sec) {
  const now = Date.now();
  A().rest = { end: now + sec * 1000, total: sec, notified: false };
  save();
  renderRest();
}

function adjustRest(d) {
  const r = A()?.rest;
  if (!r) return;
  const now = Date.now();
  r.end = Math.max(now, r.end) + d * 1000;
  r.total = Math.max(1, r.total + d);
  r.notified = r.end <= now;
  save();
  renderRest();
  tick();
}

function skipRest() {
  A().rest = null;
  save();
  renderRest();
}

function renderRest() {
  if (!restBar) return;
  const r = A()?.rest;
  restBar.classList.toggle('on', !!r);
  restBar.classList.remove('over');
  if (!r) return;
  const left = (r.end - Date.now()) / 1000;
  restFill.style.transition = 'none';
  restFill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / r.total))})`;
  void restFill.offsetWidth;
  if (left > 0) {
    restFill.style.transition = `transform ${left}s linear`;
    restFill.style.transform = 'scaleX(0)';
  }
  tick();
}

function tick() {
  const a = A();
  if (!a) return;
  const now = Date.now();
  const elapsed = f.clock((now - a.startedAt) / 1000);
  const r = a.rest;
  let restText = '';
  let over = false;
  if (r) {
    const left = Math.ceil((r.end - now) / 1000);
    if (left > 0) restText = f.clock(left);
    else {
      over = true;
      if (!r.notified) {
        r.notified = true;
        save();
        if (document.visibilityState === 'visible' && now - r.end < 10000) {
          chime();
          haptic();
        }
      }
      if (-left > 300) {
        a.rest = null;
        save();
        renderRest();
      } else restText = '+' + f.clock(-left);
    }
  }
  if (isOpen) {
    if (clockEl) clockEl.textContent = elapsed;
    if (restBar && a.rest) {
      restTime.textContent = restText;
      restLabel.textContent = over ? 'Go' : 'Rest';
      restBar.classList.toggle('over', over);
    }
  } else if (miniClock) {
    miniClock.textContent = `${a.dayName} · ${elapsed}`;
    miniRest.textContent = a.rest ? (over ? `Go ${restText}` : `Rest ${restText}`) : '';
  }
}

// ---------- mini player

function showMini() {
  if (!A()) return;
  miniClock = h('span', { class: 'mini-title' });
  miniRest = h('span', { class: 'mini-rest' });
  mini.textContent = '';
  mini.append(h('span', { class: 'mini-dot' }), miniClock, miniRest, ic('chevU', 20));
  mini.classList.add('on');
  document.body.classList.add('has-mini');
  tick();
}

function hideMini() {
  mini.classList.remove('on');
  document.body.classList.remove('has-mini');
}

// ---------- sheets & edits

function rebuildAt(i) {
  build();
  requestAnimationFrame(() => goTo(Math.max(0, Math.min(i, A().items.length - 1)), false));
}

function overview() {
  const a = A();
  haptic();
  const cur = currentIndex();
  const list = h('div', { class: 'ov-list' });
  const doneCount = a.items.filter((it) => it.sets.length && it.sets.every((s) => s.done)).length;
  const sh = sheet({ title: `${a.dayName} · ${doneCount} of ${a.items.length} done`, body: list, cls: 'tall' });
  a.items.forEach((it, i) => {
    const done = it.sets.filter((s) => s.done).length;
    const row = h('button', { class: 'ov-row' + (i === cur ? ' cur' : '') },
      h('span', { class: 'ov-i', text: String(i + 1) }),
      h('span', { class: 'ov-name', text: exName(it.exId) }),
      h('span', { class: 'ov-n', text: it.skipped ? 'Skipped' : `${done}/${it.sets.length}` }),
      h('span', { class: 'ov-check' }, done === it.sets.length && done ? ic('check', 18) : null));
    row.addEventListener('click', () => { sh.close(); goTo(i, Math.abs(i - cur) < 3); });
    list.append(row);
  });
  const add = h('button', { class: 'row-btn' }, ic('plus', 20), h('span', { text: 'Add exercise' }));
  add.addEventListener('click', () => { sh.close(); addExercise(); });
  const discardBtn = h('button', { class: 'row-btn danger-text' }, ic('trash', 20), h('span', { text: 'Discard workout' }));
  discardBtn.addEventListener('click', async () => {
    sh.close();
    if (await confirm({ title: 'Discard workout?', message: 'Everything logged in this session will be deleted.', ok: 'Discard', danger: true })) discard();
  });
  list.append(add, discardBtn);
}

function addExercise() {
  pickExercise({
    onPick: (id) => {
      A().items.push(makeItem(id, { sets: 3, setsMin: 3, repMin: 8, repMax: 12 }));
      save();
      rebuildAt(A().items.length - 1);
    },
  });
}

function exerciseMenu(i) {
  const it = A().items[i], ex = exOf(it);
  const alt = it.alt && store.data.exercises[it.alt] ? it.alt : null;
  actions({
    title: ex.name,
    items: [
      alt ? { label: `Swap to ${exName(alt)}`, icon: 'swap', onSelect: () => swap(i, alt) } : null,
      { label: 'Swap exercise', sub: 'Machine taken? Pick another one', icon: 'swap', onSelect: () => pickExercise({ title: 'Swap for', onPick: (id) => swap(i, id) }) },
      { label: 'Add a set', icon: 'plus', onSelect: () => addSet(i) },
      it.sets.length > 1 ? { label: 'Remove last set', icon: 'minus', onSelect: () => removeSet(i) } : null,
      { label: ex.notes ? 'Edit notes' : 'Add notes', sub: 'Seat height, pins, grip', icon: 'note', onSelect: () => editNotes(i) },
      { label: 'History', icon: 'history', onSelect: () => historySheet(it.exId) },
      { label: `Rest time · ${f.clock(restOf(it))}`, icon: 'clock', onSelect: () => restSheet(i) },
      { label: it.skipped ? 'Unskip exercise' : 'Skip exercise', icon: 'skip', onSelect: () => skip(i) },
      { label: 'Remove from workout', icon: 'trash', danger: true, onSelect: () => removeItem(i) },
    ],
  });
}

async function swap(i, id) {
  const it = A().items[i];
  if (id === it.exId) return;
  if (it.sets.some((s) => s.done) && !(await confirm({ title: 'Swap exercise?', message: 'Sets already logged for this exercise will be removed.', ok: 'Swap' }))) return;
  const alt = it.alt === id ? it.exId : it.alt;
  A().items[i] = makeItem(id, it.target, alt);
  save();
  rebuildAt(i);
}

function addSet(i) {
  const it = A().items[i];
  const lastSet = it.sets[it.sets.length - 1];
  it.sets.push({ w: lastSet?.w ?? 0, r: lastSet?.r ?? it.target.repMin, rir: null, done: false, at: null });
  it.sel = it.sets.length - 1;
  it.skipped = false;
  save();
  renderPage(pages[i]);
  renderSegs();
}

async function removeSet(i) {
  const it = A().items[i];
  const lastSet = it.sets[it.sets.length - 1];
  if (lastSet.done && !(await confirm({ title: 'Remove logged set?', message: `Set ${it.sets.length} is already logged.`, ok: 'Remove', danger: true }))) return;
  it.sets.pop();
  it.target.setsMin = Math.min(it.target.setsMin, it.sets.length);
  it.sel = it.sets.findIndex((s) => !s.done);
  save();
  renderPage(pages[i]);
  renderSegs();
}

function editNotes(i) {
  const id = A().items[i].exId;
  editText({
    title: 'Exercise notes', value: exOf(A().items[i]).notes, placeholder: 'Seat 4, back pad 2, neutral grip…',
    onSave: (v) => {
      if (!store.data.exercises[id]) return;
      store.update((d) => { d.exercises[id].notes = v; });
      rebuildAt(i);
    },
  });
}

function restSheet(i) {
  const id = A().items[i].exId;
  const cur = restOf(A().items[i]);
  const grid = h('div', { class: 'preset-grid' });
  const sh = sheet({ title: 'Rest time', body: grid });
  [45, 60, 75, 90, 120, 150, 180, 240, 300].forEach((sec) => {
    const b = h('button', { class: 'preset' + (sec === cur ? ' on' : ''), text: f.clock(sec) });
    b.addEventListener('click', () => {
      haptic();
      sh.close();
      if (store.data.exercises[id]) store.update((d) => { d.exercises[id].rest = sec; });
      if (A().rest && currentIndex() === i) {
        A().rest.end += (sec - cur) * 1000;
        A().rest.total = sec;
        save();
      }
      rebuildAt(i);
    });
    grid.append(b);
  });
}

export function historySheet(exId) {
  const ex = store.data.exercises[exId];
  const hist = exHistory(exId).slice(0, 12);
  const list = h('div', { class: 'card list flat' });
  if (!hist.length) list.append(h('p', { class: 'empty-note', text: 'Nothing logged yet.' }));
  for (const x of hist) {
    list.append(h('div', { class: 'li' },
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title', text: x.sets.map((s) => f.setText(s, ex)).join(', ') }),
        h('div', { class: 'li-sub', text: `${f.day(x.session.startedAt)} · ${x.session.dayName}` }))));
  }
  sheet({ title: ex?.name ?? 'History', body: list, cls: 'tall' });
}

function skip(i) {
  const it = A().items[i];
  it.skipped = !it.skipped;
  if (it.skipped) it.sel = -1;
  else it.sel = it.sets.findIndex((s) => !s.done);
  save();
  renderPage(pages[i]);
  renderSegs();
  if (it.skipped) {
    const n = nextOpen(i);
    if (n != null) setTimeout(() => goTo(n), 250);
  }
}

async function removeItem(i) {
  const it = A().items[i];
  if (it.sets.some((s) => s.done) && !(await confirm({ title: 'Remove exercise?', message: 'Its logged sets will be deleted.', ok: 'Remove', danger: true }))) return;
  A().items.splice(i, 1);
  save();
  rebuildAt(i);
}

// ---------- finish / discard

async function finish() {
  const a = A();
  const logged = a.items.reduce((n, it) => n + it.sets.filter((s) => s.done).length, 0);
  if (!logged) {
    if (await confirm({ title: 'Nothing logged yet', message: 'Discard this workout?', ok: 'Discard', danger: true })) discard();
    return;
  }
  const missing = a.items.reduce((n, it) => (it.skipped ? n : n + it.sets.slice(0, it.target.setsMin).filter((s) => !s.done).length), 0);
  if (missing && !(await confirm({ title: 'Finish workout?', message: `${f.plural(missing, 'set')} not logged yet. Unlogged sets won't be saved.`, ok: 'Finish', cancel: 'Keep going' }))) return;

  const s = {
    id: a.id,
    dayId: a.dayId,
    dayName: a.dayName,
    startedAt: a.startedAt,
    endedAt: Date.now(),
    notes: a.notes || '',
    items: a.items
      .map((it) => ({ exId: it.exId, target: it.target, sets: it.sets.filter((x) => x.done).map((x) => ({ w: x.w, r: x.r, rir: x.rir, done: true, at: x.at })) }))
      .filter((it) => it.sets.length),
  };
  store.data.sessions.push(s);
  store.data.sessions.sort((x, y) => x.startedAt - y.startedAt);
  store.active = null;
  save();
  store.flush();
  keepAwake(false);
  haptic();
  store.emit('data');
  showSummary(s);
}

function showSummary(s) {
  const done = h('button', { class: 'btn primary block big', text: 'Done' });
  const scroller = h('div', { class: 'summary-scroll' });
  const render = () => {
    scroller.textContent = '';
    scroller.append(
      h('div', { class: 'summary-head' },
        h('div', { class: 'eyebrow', text: 'Workout complete' }),
        h('h1', { class: 'hero-title', text: s.dayName }),
        h('div', { class: 'summary-sub', text: `${f.longDay(s.startedAt)} · ${f.time(s.startedAt)}` })),
      sessionView(s, { editable: true, onChange: render }));
  };
  render();
  const wrap = h('div', { class: 'summary' }, scroller, h('div', { class: 'summary-foot' }, done));
  layer.textContent = '';
  layer.append(wrap);
  pager = null;
  restBar = null;
  done.addEventListener('click', () => {
    haptic();
    closeLayer();
  });
}

function discard() {
  store.active = null;
  save();
  keepAwake(false);
  closeLayer();
  hideMini();
  store.emit('active');
  toast('Workout discarded');
}
