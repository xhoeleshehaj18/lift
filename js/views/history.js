// History tab: month calendar, workout list, and the workout detail screen.
import { store } from '../store.js';
import { h, ic, haptic } from '../ui.js';
import { page, push, pop } from '../nav.js';
import { sheet, confirm, actions, toast } from '../sheets.js';
import * as f from '../fmt.js';
import { sessionStats, sessionPRs, weekStart } from '../logic.js';
import { sessionView } from './session.js';

export function HistoryScreen() {
  const pg = page({ title: 'History' });
  let view = new Date();
  view = new Date(view.getFullYear(), view.getMonth(), 1);

  function render() {
    const c = pg.content;
    c.textContent = '';
    const all = store.data.sessions;
    const y = view.getFullYear(), m = view.getMonth();
    const from = new Date(y, m, 1).getTime(), to = new Date(y, m + 1, 1).getTime();
    const month = all.filter((s) => s.startedAt >= from && s.startedAt < to);

    const prev = h('button', { class: 'icon-btn', 'aria-label': 'Previous month' }, ic('chevL', 22));
    const next = h('button', { class: 'icon-btn', 'aria-label': 'Next month' }, ic('chevR', 22));
    prev.addEventListener('click', () => { haptic(); view = new Date(y, m - 1, 1); render(); });
    next.addEventListener('click', () => { haptic(); view = new Date(y, m + 1, 1); render(); });
    const cal = h('div', { class: 'card cal' }, h('div', { class: 'cal-head' }, prev, h('div', { class: 'cal-title', text: f.month(from) }), next));

    const grid = h('div', { class: 'cal-grid' });
    const ws = weekStart(from);
    for (let i = 0; i < 7; i++) grid.append(h('span', { class: 'cal-dow', text: f.narrow(f.addDays(ws, i)) }));
    const start = weekStart(from);
    const now = Date.now();
    for (let d = start; d < to || new Date(d).getDay() !== new Date(start).getDay(); d = f.addDays(d, 1)) {
      const inMonth = d >= from && d < to;
      const ss = inMonth ? all.filter((s) => f.sameDay(s.startedAt, d)) : [];
      const cell = h('button', { class: 'cal-day' + (inMonth ? '' : ' out') + (ss.length ? ' trained' : '') + (f.sameDay(d, now) ? ' today' : '') },
        h('span', { text: String(new Date(d).getDate()) }));
      if (ss.length) cell.addEventListener('click', () => push(SessionScreen(ss[ss.length - 1].id)));
      grid.append(cell);
    }
    cal.append(grid);
    c.append(cal);

    if (!all.length) {
      c.append(h('div', { class: 'empty' }, ic('history', 32), h('p', { text: 'Finished workouts show up here.' })));
      return;
    }

    let vol = 0, ms = 0;
    month.forEach((s) => { const st = sessionStats(s); vol += st.volume; ms += st.duration; });
    c.append(h('div', { class: 'stats3 card' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: String(month.length) }), h('div', { class: 'stat-label', text: 'Workouts' })),
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: month.length ? f.hm(ms) : '–' }), h('div', { class: 'stat-label', text: 'Time' })),
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: f.big(f.toDisp(vol)) }), h('div', { class: 'stat-label', text: `Volume ${f.unit()}` }))));

    if (!month.length) {
      c.append(h('p', { class: 'empty-note', text: 'No workouts this month.' }));
      return;
    }
    const list = h('div', { class: 'card list' });
    for (const s of [...month].reverse()) {
      const st = sessionStats(s);
      const prs = sessionPRs(s).length;
      const row = h('button', { class: 'li' },
        h('div', { class: 'li-date' }, h('span', { text: String(new Date(s.startedAt).getDate()) }), h('small', { text: f.narrow(s.startedAt) })),
        h('div', { class: 'li-main' },
          h('div', { class: 'li-title' }, s.dayName, prs ? h('span', { class: 'badge sm', text: prs > 1 ? `${prs} PR` : 'PR' }) : null),
          h('div', { class: 'li-sub', text: `${f.dur(st.duration)} · ${f.plural(st.sets, 'set')} · ${f.vol(st.volume)}` })),
        ic('chevR', 18));
      row.addEventListener('click', () => push(SessionScreen(s.id)));
      list.append(row);
    }
    c.append(list);
  }

  return { el: pg.el, render };
}

export function SessionScreen(id) {
  const more = h('button', { class: 'icon-btn', 'aria-label': 'More' }, ic('more', 24));
  const pg = page({ title: '', back: true, right: more });
  const find = () => store.data.sessions.find((s) => s.id === id);

  more.addEventListener('click', () => {
    const s = find();
    if (!s) return;
    actions({
      title: s.dayName,
      items: [
        { label: 'Change date & time', icon: 'clock', onSelect: () => changeDate(s) },
        { label: 'Rename', icon: 'edit', onSelect: () => rename(s) },
        { label: 'Delete workout', icon: 'trash', danger: true, onSelect: () => remove(s) },
      ],
    });
  });

  function render() {
    const s = find();
    if (!s) return;
    pg.setTitle(s.dayName);
    pg.setEyebrow(`${f.longDay(s.startedAt)} · ${f.time(s.startedAt)}`);
    pg.content.textContent = '';
    pg.content.append(sessionView(s, { editable: true, onChange: render }));
  }

  async function remove(s) {
    if (!(await confirm({ title: 'Delete workout?', message: `${s.dayName} on ${f.day(s.startedAt)} will be removed from your history and progress.`, ok: 'Delete', danger: true }))) return;
    store.update((d) => { d.sessions = d.sessions.filter((x) => x.id !== s.id); });
    pop();
    toast('Workout deleted');
  }

  function rename(s) {
    const input = h('input', { class: 'field', type: 'text', value: s.dayName });
    const save = h('button', { class: 'btn primary block', text: 'Save' });
    const sh = sheet({ title: 'Rename workout', body: input, footer: save });
    save.addEventListener('click', () => {
      const v = input.value.trim();
      if (v) store.update(() => { s.dayName = v; });
      sh.close();
    });
  }

  function changeDate(s) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(s.startedAt);
    const input = h('input', { class: 'field', type: 'datetime-local', value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` });
    const save = h('button', { class: 'btn primary block', text: 'Save' });
    const sh = sheet({ title: 'Date & time', body: input, footer: save });
    save.addEventListener('click', () => {
      const t = new Date(input.value).getTime();
      if (!isNaN(t)) {
        const delta = t - s.startedAt;
        store.update((data) => {
          s.startedAt += delta;
          if (s.endedAt) s.endedAt += delta;
          data.sessions.sort((a, b) => a.startedAt - b.startedAt);
        });
      }
      sh.close();
    });
  }

  return { el: pg.el, render };
}
