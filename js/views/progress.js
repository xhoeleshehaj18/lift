// Progress tab: per-exercise charts and records, body weight, weekly volume.
import { store, uid } from '../store.js';
import { MUSCLES } from '../seed.js';
import { h, ic, haptic, segmented } from '../ui.js';
import { page, push } from '../nav.js';
import { keypad, actions, toast, editText } from '../sheets.js';
import { lineChart, sparkline } from '../charts.js';
import * as f from '../fmt.js';
import { series, records, exHistory, bodySeries, volumeByMuscle, weekStart, sessionsBetween, streak, e1rm } from '../logic.js';
import { exerciseForm } from './picker.js';

let tab = 'exercises';

export function ProgressScreen() {
  const pg = page({ title: 'Progress' });
  const seg = segmented([['exercises', 'Exercises'], ['body', 'Body'], ['volume', 'Volume']], tab, (v) => { tab = v; draw(); });
  const body = h('div', { class: 'fade-swap' });
  let weekOffset = 0;

  function render() {
    pg.content.textContent = '';
    pg.content.append(seg, body);
    draw();
  }

  function draw() {
    body.textContent = '';
    body.classList.remove('in');
    void body.offsetWidth;
    body.classList.add('in');
    if (tab === 'exercises') exercisesTab(body);
    else if (tab === 'body') bodyTab(body);
    else volumeTab(body);
  }

  function exercisesTab(c) {
    const order = [];
    for (const d of store.data.program.days) for (const it of d.items) if (!order.includes(it.exId)) order.push(it.exId);
    for (const id in store.data.exercises) if (!order.includes(id)) order.push(id);
    const logged = [], fresh = [];
    for (const id of order) {
      if (!store.data.exercises[id]) continue;
      (exHistory(id).length ? logged : fresh).push(id);
    }
    if (logged.length) {
      const list = h('div', { class: 'card list' });
      for (const id of logged) {
        const s = series(id);
        const lastP = s[s.length - 1];
        const row = h('button', { class: 'li' },
          h('div', { class: 'li-main' },
            h('div', { class: 'li-title', text: store.data.exercises[id].name }),
            h('div', { class: 'li-sub', text: `${f.setText({ w: lastP.top, r: lastP.reps }, store.data.exercises[id])} · ${f.plural(s.length, 'session')}` })),
          h('div', { class: 'li-spark', html: sparkline(s.slice(-12).map((p) => p.e1rm || p.reps)) }),
          ic('chevR', 18));
        row.addEventListener('click', () => push(ExerciseScreen(id)));
        list.append(row);
      }
      c.append(list);
    } else {
      c.append(h('div', { class: 'empty' }, ic('progress', 32), h('p', { text: 'Charts and records appear after your first workout.' })));
    }
    if (fresh.length) {
      c.append(h('div', { class: 'section-label', text: 'Not logged yet' }));
      c.append(h('div', { class: 'card list dim' }, fresh.map((id) => {
        const row = h('button', { class: 'li' }, h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: store.data.exercises[id].name })), ic('chevR', 18));
        row.addEventListener('click', () => push(ExerciseScreen(id)));
        return row;
      })));
    }
  }

  function bodyTab(c) {
    const all = bodySeries().map((e) => ({ ...e, t: f.fromKey(e.date) }));
    const last = all[all.length - 1];
    const big = h('div', { class: 'big-num' });
    const sub = h('div', { class: 'big-sub' });
    const setBig = (p) => {
      if (!p) { big.textContent = '–'; sub.textContent = 'No weigh-ins yet'; return; }
      big.innerHTML = `${f.num1(f.toDisp(p.trend))}<small>${f.unit()}</small>`;
      sub.textContent = p === last ? trendText(all) : `${f.day(p.t)} · weighed ${f.wu(p.kg)}`;
    };
    setBig(last);
    c.append(h('div', { class: 'big-block' }, h('div', { class: 'eyebrow', text: 'Trend weight' }), big, sub));
    const chartHost = h('div');
    let span = 90;
    const drawChart = () => {
      chartHost.textContent = '';
      const from = span ? Date.now() - span * 86400000 : 0;
      const pts = all.filter((p) => p.t >= from);
      chartHost.append(lineChart({ data: pts, y: (p) => f.toDisp(p.kg), line: (p) => f.toDisp(p.trend), fmt: f.num1, onScrub: (p) => setBig(p || last) }));
    };
    drawChart();
    c.append(chartHost, segmented([[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']], span, (v) => { span = v; drawChart(); }, 'small ranges'));
    const add = h('button', { class: 'btn primary block', text: 'Log weight' });
    add.addEventListener('click', () => logWeight());
    c.append(add);
    if (all.length) {
      c.append(h('div', { class: 'section-label', text: 'Weigh-ins' }));
      const list = h('div', { class: 'card list' });
      for (const e of [...all].reverse().slice(0, 60)) {
        const row = h('button', { class: 'li' },
          h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: f.wu(e.kg) }), h('div', { class: 'li-sub', text: f.day(e.t) })));
        row.addEventListener('click', () => actions({
          title: `${f.wu(e.kg)} · ${f.day(e.t)}`,
          items: [
            { label: 'Edit', icon: 'edit', onSelect: () => keypad({ label: `Body weight (${f.unit()})`, value: f.round2(f.toDisp(e.kg)), suffix: f.unit(), onDone: (v) => v > 0 && store.update((d) => { d.bodyweight.find((x) => x.id === e.id).kg = f.fromDisp(v); }) }) },
            { label: 'Delete', icon: 'trash', danger: true, onSelect: () => store.update((d) => { d.bodyweight = d.bodyweight.filter((x) => x.id !== e.id); }) },
          ],
        }));
        list.append(row);
      }
      c.append(list);
    }
  }

  function volumeTab(c) {
    const now = Date.now();
    const from = weekStart(f.addDays(now, weekOffset * 7));
    const to = f.addDays(from, 7);
    const vol = volumeByMuscle(from, to);
    const prev = volumeByMuscle(f.addDays(from, -7), from);
    const prevBtn = h('button', { class: 'icon-btn', 'aria-label': 'Previous week' }, ic('chevL', 22));
    const nextBtn = h('button', { class: 'icon-btn', 'aria-label': 'Next week' }, ic('chevR', 22));
    prevBtn.addEventListener('click', () => { haptic(); weekOffset--; draw(); });
    nextBtn.addEventListener('click', () => { haptic(); if (weekOffset < 0) { weekOffset++; draw(); } });
    nextBtn.disabled = weekOffset >= 0;
    const label = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${f.short(from)} – ${f.short(f.addDays(to, -1))}`;
    const n = sessionsBetween(from, to).length;
    c.append(h('div', { class: 'card' },
      h('div', { class: 'cal-head' }, prevBtn, h('div', { class: 'cal-title' }, label, h('small', { text: f.plural(n, 'workout') })), nextBtn),
      bars(vol, prev)));
    c.append(h('p', { class: 'foot-note', text: 'Hard sets per muscle. The main muscle counts 1 set, assisting muscles ½. Grey ticks show the week before.' }));

    c.append(h('div', { class: 'section-label', text: 'Consistency' }));
    c.append(heatmap(now));
    // average over the last 8 full weeks, or fewer if training started more recently
    const ws = weekStart(now);
    const first = store.data.sessions.reduce((m, s) => Math.min(m, s.startedAt), Infinity);
    const weeks = Math.min(8, Math.round((ws - weekStart(Math.min(first, ws))) / (7 * 86400000)));
    const avg = weeks ? sessionsBetween(f.addDays(ws, -7 * weeks), ws).length / weeks : null;
    c.append(h('div', { class: 'stats3 card' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: String(store.data.sessions.length) }), h('div', { class: 'stat-label', text: 'Workouts' })),
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: f.num1(avg) }), h('div', { class: 'stat-label', text: 'Weekly avg' })),
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: String(streak(now)) }), h('div', { class: 'stat-label', text: 'Week streak' }))));
  }

  return { el: pg.el, render };
}

function bars(vol, prev) {
  const keys = Object.keys(MUSCLES).filter((k) => vol[k] || prev[k]);
  const wrap = h('div', { class: 'bars' });
  if (!keys.length) {
    wrap.append(h('p', { class: 'empty-note', text: 'No sets logged this week.' }));
    return wrap;
  }
  const max = Math.max(4, ...keys.map((k) => Math.max(vol[k] || 0, prev[k] || 0)));
  keys.sort((a, b) => (vol[b] || 0) - (vol[a] || 0));
  for (const k of keys) {
    const v = vol[k] || 0, p = prev[k] || 0;
    const fill = h('i', { style: { transform: `scaleX(${v / max})` } });
    const bar = h('div', { class: 'bar-track' }, fill, p ? h('b', { style: { left: `${(p / max) * 100}%` } }) : null);
    wrap.append(h('div', { class: 'bar-row' }, h('span', { class: 'bar-name', text: MUSCLES[k] }), bar, h('span', { class: 'bar-val', text: f.num1(v) })));
  }
  return wrap;
}

function heatmap(now) {
  const weeks = 18;
  const start = f.addDays(weekStart(now), -(weeks - 1) * 7);
  const days = new Map();
  for (const s of store.data.sessions) {
    if (s.startedAt < start) continue;
    const k = f.dayKey(s.startedAt);
    days.set(k, (days.get(k) || 0) + 1);
  }
  const grid = h('div', { class: 'heat' });
  for (let w = 0; w < weeks; w++) {
    const col = h('div', { class: 'heat-col' });
    for (let d = 0; d < 7; d++) {
      const t = f.addDays(start, w * 7 + d);
      const on = days.get(f.dayKey(t));
      col.append(h('span', { class: 'heat-cell' + (on ? ' on' : '') + (t > now ? ' future' : '') + (f.sameDay(t, now) ? ' today' : '') }));
    }
    grid.append(col);
  }
  return h('div', { class: 'card heat-card' }, grid, h('div', { class: 'heat-legend' }, h('span', { text: f.short(start) }), h('span', { text: 'Today' })));
}

function trendText(all) {
  if (all.length < 2) return 'Log a few more weigh-ins to see the trend';
  const last = all[all.length - 1];
  const ref = all.find((p) => p.t >= last.t - 30 * 86400000) || all[0];
  const d = f.toDisp(last.trend) - f.toDisp(ref.trend);
  const days = Math.max(1, f.daysBetween(ref.t, last.t));
  const sign = d > 0.05 ? '+' : d < -0.05 ? '−' : '±';
  return `${sign}${f.num1(Math.abs(d))} ${f.unit()} over ${f.plural(days, 'day')}`;
}

export function logWeight() {
  const bw = bodySeries();
  const last = bw[bw.length - 1];
  keypad({
    label: `Body weight today (${f.unit()})`,
    value: last ? f.round2(f.toDisp(last.kg)) : null,
    suffix: f.unit(),
    onDone: (v) => {
      if (!(v > 0)) return;
      const k = f.dayKey(Date.now());
      store.update((d) => {
        const e = d.bodyweight.find((x) => x.date === k);
        if (e) e.kg = f.fromDisp(v);
        else d.bodyweight.push({ id: uid(), date: k, kg: f.fromDisp(v) });
      });
      haptic();
      toast(`Logged ${f.num(v)} ${f.unit()}`);
    },
  });
}

const METRICS = {
  e1rm: { label: 'Est. 1RM', get: (p) => p.e1rm, fmt: (v) => f.num1(f.toDisp(v)) },
  top: { label: 'Top weight', get: (p) => p.top, fmt: (v) => f.num1(f.toDisp(v)) },
  volume: { label: 'Volume', get: (p) => p.volume, fmt: (v) => f.int(f.toDisp(v)) },
  reps: { label: 'Best reps', get: (p) => p.reps, fmt: (v) => f.int(v) },
};

let metric = 'e1rm';

export function ExerciseScreen(exId) {
  const edit = h('button', { class: 'icon-btn', 'aria-label': 'Edit exercise' }, ic('edit', 22));
  const pg = page({ title: '', back: true, right: edit });
  edit.addEventListener('click', () => {
    const ex = store.data.exercises[exId];
    if (ex) exerciseForm({ ex });
  });
  let span = 0;

  function render() {
    const ex = store.data.exercises[exId];
    if (!ex) return;
    pg.setTitle(ex.name);
    const c = pg.content;
    c.textContent = '';
    const all = series(exId);
    const isBw = ex.bodyweight && all.every((p) => !p.top);
    if (isBw && metric !== 'reps' && metric !== 'volume') metric = 'reps';
    const opts = isBw ? [['reps', 'Best reps'], ['volume', 'Volume']] : [['e1rm', 'Est. 1RM'], ['top', 'Top weight'], ['volume', 'Volume']];
    if (!opts.some(([k]) => k === metric)) metric = opts[0][0];

    const big = h('div', { class: 'big-num' });
    const sub = h('div', { class: 'big-sub' });
    const head = h('div', { class: 'big-block' }, big, sub);
    const chartHost = h('div');

    const draw = () => {
      const M = METRICS[metric];
      const from = span ? Date.now() - span * 86400000 : 0;
      const pts = all.filter((p) => p.t >= from);
      const lastP = pts[pts.length - 1];
      const unitLabel = metric === 'reps' ? 'reps' : f.unit();
      const setBig = (p) => {
        if (!p) { big.textContent = '–'; sub.textContent = 'No sessions in this range'; return; }
        big.innerHTML = `${M.fmt(M.get(p))}<small>${unitLabel}</small>`;
        if (p !== lastP) { sub.textContent = `${f.day(p.t)} · ${p.sets.map((s) => f.setText(s, ex)).join(', ')}`; return; }
        const first = pts[0];
        const d = M.get(lastP) - M.get(first);
        const shown = metric === 'reps' ? d : f.toDisp(d);
        sub.textContent = pts.length > 1 ? `${d >= 0 ? '+' : '−'}${metric === 'volume' || metric === 'reps' ? f.int(Math.abs(shown)) : f.num1(Math.abs(shown))} since ${f.short(first.t)}` : `${f.day(lastP.t)}`;
      };
      setBig(lastP);
      chartHost.textContent = '';
      if (pts.length) chartHost.append(lineChart({ data: pts, y: (p) => (metric === 'reps' ? M.get(p) : f.toDisp(M.get(p))), fmt: metric === 'volume' || metric === 'reps' ? f.int : f.num1, dots: true, onScrub: (p) => setBig(p || lastP) }));
      else chartHost.append(h('div', { class: 'chart-empty', text: all.length ? 'No sessions in this range' : 'Log this exercise to see a chart' }));
    };

    c.append(segmented(opts, metric, (v) => { metric = v; draw(); }, 'small'), head, chartHost,
      segmented([[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y'], [0, 'All']], span, (v) => { span = v; draw(); }, 'small ranges'));
    draw();

    const rec = records(exId);
    if (rec.count) {
      c.append(h('div', { class: 'section-label', text: 'Records' }));
      c.append(h('div', { class: 'card list' },
        !isBw && rec.e1rm ? recRow('Est. 1RM', f.wu1(rec.e1rm.value), `${f.setText(rec.e1rm, ex)} · ${f.short(rec.e1rm.t)}`) : null,
        !isBw && rec.heavy ? recRow('Heaviest set', f.setText(rec.heavy, ex), f.short(rec.heavy.t)) : null,
        rec.reps ? recRow('Most reps', `${rec.reps.r} reps`, `${f.setText(rec.reps, ex)} · ${f.short(rec.reps.t)}`) : null,
        !isBw && rec.volume ? recRow('Best session volume', f.vol(rec.volume.value), f.short(rec.volume.t)) : null));

      c.append(h('div', { class: 'section-label', text: 'History' }));
      c.append(h('div', { class: 'card list' }, [...all].reverse().slice(0, 30).map((p) =>
        h('div', { class: 'li' },
          h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: p.sets.map((s) => f.setText(s, ex)).join(', ') }), h('div', { class: 'li-sub', text: f.day(p.t) })),
          !isBw ? h('div', { class: 'li-end', text: f.num1(f.toDisp(Math.max(...p.sets.map((s) => e1rm(s.w, s.r))))) }) : null))));
    }

    c.append(h('div', { class: 'section-label', text: 'Notes' }));
    const note = h('button', { class: 'card note-card' + (ex.notes ? '' : ' is-empty') }, ic('note', 20), h('span', { text: ex.notes || 'Seat height, pins, grip…' }));
    note.addEventListener('click', () => editText({ title: 'Exercise notes', value: ex.notes, onSave: (v) => store.update((d) => { d.exercises[exId].notes = v; }) }));
    c.append(note);
  }

  return { el: pg.el, render };
}

function recRow(label, value, sub) {
  return h('div', { class: 'li' }, h('div', { class: 'li-main' }, h('div', { class: 'li-sub', text: label }), h('div', { class: 'li-title', text: value })), h('div', { class: 'li-end', text: sub }));
}
