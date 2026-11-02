// Program tab: the split, day editor with drag-to-reorder, exercise library.
import { store, uid } from '../store.js';
import { MUSCLES } from '../seed.js';
import { h, ic, haptic } from '../ui.js';
import { page, push, pop } from '../nav.js';
import { sheet, confirm, actions, toast, editText } from '../sheets.js';
import * as f from '../fmt.js';
import { estMinutes, exName, exHistory } from '../logic.js';
import { pickExercise, exerciseForm, stepRow } from './picker.js';
import { startWorkout } from './workout.js';
import { SettingsScreen } from './settings.js';
import { ExerciseScreen } from './progress.js';

const days = () => store.data.program.days;

export function ProgramScreen() {
  const pg = page({ title: 'Program' });

  function render() {
    const c = pg.content;
    c.textContent = '';
    const name = h('button', { class: 'program-name' }, h('span', { text: store.data.program.name }), ic('edit', 16));
    name.addEventListener('click', () => editText({
      title: 'Program name', value: store.data.program.name, multiline: false,
      onSave: (v) => v && store.update((d) => { d.program.name = v; }),
    }));
    c.append(name);

    const list = h('div', { class: 'card list' });
    days().forEach((d, i) => {
      const row = h('button', { class: 'li' + (d.rest ? ' rest' : '') },
        h('span', { class: 'li-num', text: String(i + 1) }),
        h('div', { class: 'li-main' },
          h('div', { class: 'li-title', text: d.name }),
          h('div', { class: 'li-sub', text: d.rest ? 'Rest day' : `${f.plural(d.items.length, 'exercise')} · ${f.plural(d.items.reduce((n, it) => n + it.sets, 0), 'set')} · ≈${estMinutes(d)} min` })),
        ic('chevR', 18));
      row.addEventListener('click', () => push(DayScreen(d.id)));
      list.append(row);
    });
    c.append(list);
    const add = h('button', { class: 'row-btn' }, ic('plus', 20), h('span', { text: 'Add day' }));
    add.addEventListener('click', () => {
      const d = { id: 'd-' + uid(), name: `Day ${days().length + 1}`, rest: false, items: [] };
      store.update((data) => data.program.days.push(d));
      push(DayScreen(d.id));
    });
    c.append(add);
    c.append(h('p', { class: 'foot-note', text: 'Days run in order. After your last workout, rest days pass with the calendar and the next training day comes up automatically.' }));

    c.append(h('div', { class: 'section-label', text: 'More' }));
    const lib = h('button', { class: 'li' }, h('span', { class: 'li-icon' }, ic('list', 20)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: 'Exercise library' })),
      h('div', { class: 'li-end', text: String(Object.keys(store.data.exercises).length) }), ic('chevR', 18));
    lib.addEventListener('click', () => push(LibraryScreen()));
    const set = h('button', { class: 'li' }, h('span', { class: 'li-icon' }, ic('settings', 20)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: 'Settings' })), ic('chevR', 18));
    set.addEventListener('click', () => push(SettingsScreen()));
    c.append(h('div', { class: 'card list' }, lib, set));
  }

  return { el: pg.el, render };
}

export function DayScreen(dayId) {
  const more = h('button', { class: 'icon-btn', 'aria-label': 'Day options' }, ic('more', 24));
  const pg = page({ title: '', back: true, right: more });
  const day = () => days().find((d) => d.id === dayId);

  more.addEventListener('click', () => {
    const d = day();
    if (!d) return;
    const i = days().indexOf(d);
    actions({
      title: d.name,
      items: [
        { label: 'Rename', icon: 'edit', onSelect: () => editText({ title: 'Day name', value: d.name, multiline: false, onSave: (v) => v && store.update(() => { d.name = v; }) }) },
        { label: d.rest ? 'Make it a training day' : 'Make it a rest day', icon: d.rest ? 'train' : 'clock', onSelect: () => store.update(() => { d.rest = !d.rest; if (d.rest && d.name !== 'Rest' && !d.items.length) d.name = 'Rest'; }) },
        i > 0 ? { label: 'Move earlier', icon: 'up', onSelect: () => move(i, i - 1) } : null,
        i < days().length - 1 ? { label: 'Move later', icon: 'down', onSelect: () => move(i, i + 1) } : null,
        { label: 'Duplicate', icon: 'plus', onSelect: () => duplicate(d) },
        { label: 'Delete day', icon: 'trash', danger: true, onSelect: () => remove(d) },
      ],
    });
  });

  function move(a, b) {
    store.update((data) => {
      const [x] = data.program.days.splice(a, 1);
      data.program.days.splice(b, 0, x);
    });
  }

  function duplicate(d) {
    const copy = structuredClone(d);
    copy.id = 'd-' + uid();
    copy.name = d.name + ' copy';
    copy.items.forEach((it) => (it.id = 'i' + uid()));
    store.update((data) => data.program.days.splice(data.program.days.indexOf(d) + 1, 0, copy));
    toast('Day duplicated');
  }

  async function remove(d) {
    if (!(await confirm({ title: `Delete ${d.name}?`, message: 'Past workouts stay in your history.', ok: 'Delete', danger: true }))) return;
    store.update((data) => { data.program.days = data.program.days.filter((x) => x.id !== d.id); });
    pop();
  }

  function render() {
    const d = day();
    if (!d) return;
    const i = days().indexOf(d);
    pg.setTitle(d.name);
    pg.setEyebrow(`Day ${i + 1}`);
    const c = pg.content;
    c.textContent = '';
    if (d.rest) {
      c.append(h('div', { class: 'empty' }, ic('clock', 32), h('p', { text: 'Rest day. Use the menu to turn it into a training day.' })));
      return;
    }
    if (d.items.length) {
      const list = h('div', { class: 'card list sortable' });
      d.items.forEach((it) => {
        const ex = store.data.exercises[it.exId];
        const row = h('div', { class: 'li' },
          h('span', { class: 'grip', 'aria-label': 'Drag to reorder' }, ic('grip', 20)),
          h('button', { class: 'li-main as-btn' },
            h('div', { class: 'li-title', text: exName(it.exId) }),
            h('div', { class: 'li-sub', text: `${f.setsLabel(it)} × ${f.range(it)} · ${f.clock(ex?.rest ?? store.settings.restDefault)} rest${it.alt ? ` · or ${exName(it.alt)}` : ''}` })),
          ic('chevR', 18));
        row.querySelector('.li-main').addEventListener('click', () => editItem(d, it));
        list.append(row);
      });
      sortable(list, (from, to) => store.update(() => {
        const [x] = d.items.splice(from, 1);
        d.items.splice(to, 0, x);
      }));
      c.append(list);
    } else {
      c.append(h('p', { class: 'empty-note', text: 'No exercises yet.' }));
    }
    const add = h('button', { class: 'row-btn' }, ic('plus', 20), h('span', { text: 'Add exercise' }));
    add.addEventListener('click', () => pickExercise({
      onPick: (id) => store.update(() => d.items.push({ id: 'i' + uid(), exId: id, sets: 2, setsMin: 2, repMin: 8, repMax: 12, alt: null })),
    }));
    c.append(add);
    if (d.items.length) {
      const start = h('button', { class: 'btn secondary block', text: `Start ${d.name} now` });
      start.addEventListener('click', () => startWorkout(d));
      c.append(start);
    }
  }

  return { el: pg.el, render };
}

function editItem(d, it) {
  const ex = store.data.exercises[it.exId];
  const t = { sets: it.sets, opt: it.sets - (it.setsMin ?? it.sets), repMin: it.repMin, repMax: it.repMax, rest: ex?.rest ?? store.settings.restDefault };
  const card = h('div', { class: 'form-card' });
  const draw = () => {
    card.textContent = '';
    card.append(
      stepRow('Sets', t.sets, { min: 1, max: 10, onChange: (v) => { t.sets = v; t.opt = Math.min(t.opt, v - 1); draw(); } }),
      stepRow('Optional sets', t.opt, { min: 0, max: t.sets - 1, onChange: (v) => (t.opt = v) }),
      stepRow('Reps from', t.repMin, { min: 1, max: 50, onChange: (v) => { t.repMin = v; if (t.repMax < v) t.repMax = v; draw(); } }),
      stepRow('Reps to', t.repMax, { min: t.repMin, max: 60, onChange: (v) => (t.repMax = v) }),
      stepRow('Rest', t.rest, { min: 15, max: 600, step: 15, fmt: f.clock, onChange: (v) => (t.rest = v) }));
  };
  draw();
  const save = h('button', { class: 'btn primary block', text: 'Save' });
  const links = h('div', { class: 'act-list' });
  const link = (label, icon, fn, danger) => {
    const b = h('button', { class: 'act' + (danger ? ' danger' : '') }, ic(icon, 20), h('span', { class: 'act-label', text: label }));
    b.addEventListener('click', fn);
    links.append(b);
  };
  const sh = sheet({ title: exName(it.exId), body: [card, links], footer: save });
  link('Replace exercise', 'swap', () => { sh.close(); pickExercise({ title: 'Replace with', onPick: (id) => store.update(() => { it.exId = id; }) }); });
  link(it.alt ? `Alternative: ${exName(it.alt)}` : 'Set an alternative', 'swap', () => {
    sh.close();
    pickExercise({ title: 'Alternative exercise', onPick: (id) => store.update(() => { it.alt = id === it.exId ? null : id; }) });
  });
  if (ex) link('Edit exercise details', 'edit', () => { sh.close(); exerciseForm({ ex }); });
  link('Remove from day', 'trash', () => { sh.close(); store.update(() => d.items.splice(d.items.indexOf(it), 1)); }, true);
  save.addEventListener('click', () => {
    haptic();
    store.update((data) => {
      it.sets = t.sets;
      it.setsMin = t.sets - t.opt;
      it.repMin = t.repMin;
      it.repMax = t.repMax;
      if (data.exercises[it.exId]) data.exercises[it.exId].rest = t.rest;
    });
    sh.close();
  });
}

// Drag rows by their grip to reorder.
function sortable(list, onMove) {
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (!grip) return;
    e.preventDefault();
    const rows = [...list.children];
    const row = grip.closest('.li');
    const from = rows.indexOf(row);
    const hgt = row.getBoundingClientRect().height;
    const y0 = e.clientY;
    let to = from;
    grip.setPointerCapture(e.pointerId);
    row.classList.add('lifting');
    list.classList.add('sorting');
    haptic();
    const moveFn = (ev) => {
      const dy = ev.clientY - y0;
      row.style.transform = `translateY(${dy}px)`;
      const next = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / hgt)));
      if (next !== to) { to = next; haptic(); }
      rows.forEach((r, i) => {
        if (r === row) return;
        let s = 0;
        if (from < to && i > from && i <= to) s = -hgt;
        if (from > to && i < from && i >= to) s = hgt;
        r.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const up = () => {
      grip.removeEventListener('pointermove', moveFn);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      list.classList.remove('sorting');
      row.classList.remove('lifting');
      rows.forEach((r) => (r.style.transform = ''));
      if (to !== from) onMove(from, to);
    };
    grip.addEventListener('pointermove', moveFn);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

export function LibraryScreen() {
  const addBtn = h('button', { class: 'icon-btn', 'aria-label': 'New exercise' }, ic('plus', 24));
  addBtn.addEventListener('click', () => exerciseForm({}));
  const pg = page({ title: 'Exercises', back: true, right: addBtn });

  function usedIn(id) {
    return days().filter((d) => d.items.some((it) => it.exId === id || it.alt === id)).map((d) => d.name);
  }

  function render() {
    const c = pg.content;
    c.textContent = '';
    const all = Object.values(store.data.exercises).sort((a, b) => a.name.localeCompare(b.name));
    for (const m of Object.keys(MUSCLES)) {
      const group = all.filter((e) => e.primary[0] === m);
      if (!group.length) continue;
      c.append(h('div', { class: 'section-label', text: MUSCLES[m] }));
      c.append(h('div', { class: 'card list' }, group.map((e) => {
        const used = usedIn(e.id);
        const row = h('button', { class: 'li' },
          h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: e.name }), h('div', { class: 'li-sub', text: used.length ? [...new Set(used)].join(', ') : 'Not in program' })),
          ic('chevR', 18));
        row.addEventListener('click', () => actions({
          title: e.name,
          items: [
            { label: 'Edit', icon: 'edit', onSelect: () => exerciseForm({ ex: e }) },
            { label: 'Progress', icon: 'progress', onSelect: () => push(ExerciseScreen(e.id)) },
            { label: 'Delete', icon: 'trash', danger: true, onSelect: () => removeEx(e) },
          ],
        }));
        return row;
      })));
    }
  }

  async function removeEx(e) {
    if (usedIn(e.id).length || exHistory(e.id).length || store.active?.items.some((it) => it.exId === e.id)) {
      toast('It’s in your program or history — remove it there first');
      return;
    }
    if (!(await confirm({ title: `Delete ${e.name}?`, ok: 'Delete', danger: true }))) return;
    store.update((d) => { delete d.exercises[e.id]; });
  }

  return { el: pg.el, render };
}
