// Train tab: what's up today, the week at a glance, quick stats.
import { store } from '../store.js';
import { h, ic, haptic } from '../ui.js';
import { page, push } from '../nav.js';
import { sheet } from '../sheets.js';
import * as f from '../fmt.js';
import { today, estMinutes, sessionStats, sessionPRs, streak, workDays, weekStart, sessionsBetween, bodySeries, exName } from '../logic.js';
import { startWorkout, openWorkout } from './workout.js';
import { SettingsScreen } from './settings.js';
import { SessionScreen } from './history.js';
import { logWeight } from './progress.js';

export function TrainScreen() {
  const gear = h('button', { class: 'icon-btn', 'aria-label': 'Settings' }, ic('settings', 24));
  gear.addEventListener('click', () => push(SettingsScreen()));
  const pg = page({ right: gear, large: false });
  pg.el.classList.add('train');

  function render() {
    const c = pg.content;
    c.textContent = '';
    const now = Date.now();
    const t = today(now);
    const a = store.active;

    const hero = h('div', { class: 'hero' }, h('div', { class: 'eyebrow', text: f.longDay(now) }));
    let preview = null;

    if (a) {
      const done = a.items.reduce((n, it) => n + it.sets.filter((s) => s.done).length, 0);
      const total = a.items.reduce((n, it) => n + it.sets.length, 0);
      hero.append(
        h('h1', { class: 'hero-title', text: a.dayName }),
        h('div', { class: 'hero-sub', text: `In progress · ${done} of ${total} sets · started ${f.time(a.startedAt)}` }),
        btn('Resume workout', 'primary big', () => openWorkout()));
    } else if (t.status === 'empty') {
      hero.append(h('h1', { class: 'hero-title', text: 'Lift' }), h('div', { class: 'hero-sub', text: 'Your program has no training days yet.' }),
        btn('Start empty workout', 'primary big', () => startWorkout(null)));
    } else if (t.status === 'train') {
      const d = t.day;
      hero.append(
        h('h1', { class: 'hero-title', text: d.name }),
        h('div', { class: 'hero-sub', text: `Day ${t.index + 1} · ${f.plural(d.items.length, 'exercise')} · ≈${estMinutes(d)} min` }),
        btn('Start workout', 'primary big', () => startWorkout(d)),
        btn('Choose another day', 'text', chooseDay));
      preview = d;
    } else if (t.status === 'rest') {
      hero.append(
        h('h1', { class: 'hero-title', text: 'Rest' }),
        h('div', { class: 'hero-sub', text: `Recover. ${t.next.name} is up ${f.inDays(t.nextIn, now)}.` }),
        btn(`Train anyway · ${t.next.name}`, 'secondary big', () => startWorkout(t.next)),
        btn('Choose another day', 'text', chooseDay));
      preview = t.next;
    } else if (t.status === 'done') {
      const s = t.todays[t.todays.length - 1];
      const st = sessionStats(s);
      const prs = sessionPRs(s).length;
      hero.append(
        h('div', { class: 'hero-done' }, h('h1', { class: 'hero-title', text: s.dayName }), h('span', { class: 'done-mark' }, ic('check', 22))),
        h('div', { class: 'hero-sub', text: `Done · ${f.dur(st.duration)} · ${f.plural(st.sets, 'set')}${prs ? ` · ${f.plural(prs, 'record')}` : ''}` }),
        btn('View summary', 'secondary big', () => push(SessionScreen(s.id))),
        btn('Start another workout', 'text', chooseDay));
      preview = t.next;
    }
    c.append(hero);

    c.append(weekStrip(now));
    c.append(statsRow(now));

    if (preview && !a) {
      const label = t.status === 'train' ? 'Today' : `Up next · ${preview.name} · ${f.inDays(t.nextIn, now)}`;
      c.append(h('div', { class: 'section-label', text: label }));
      c.append(h('div', { class: 'card list' }, preview.items.map((it) =>
        h('div', { class: 'li' },
          h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: exName(it.exId) })),
          h('div', { class: 'li-end', text: `${f.setsLabel(it)} × ${f.range(it)}` })))));
    }

    const last = store.data.sessions[store.data.sessions.length - 1];
    if (last && t.status !== 'done') {
      const st = sessionStats(last);
      c.append(h('div', { class: 'section-label', text: 'Last workout' }));
      const card = h('button', { class: 'card li-card' },
        h('div', { class: 'li-main' },
          h('div', { class: 'li-title', text: last.dayName }),
          h('div', { class: 'li-sub', text: `${f.rel(last.startedAt, now)} · ${f.dur(st.duration)} · ${f.vol(st.volume)}` })),
        ic('chevR', 20));
      card.addEventListener('click', () => push(SessionScreen(last.id)));
      c.append(card);
    }
  }

  function btn(text, cls, fn) {
    const b = h('button', { class: 'btn ' + cls + (cls.includes('text') ? '' : ' block'), text });
    b.addEventListener('click', () => { haptic(); fn(); });
    return b;
  }

  function weekStrip(now) {
    const ws = weekStart(now);
    const strip = h('div', { class: 'week' });
    for (let i = 0; i < 7; i++) {
      const d = f.addDays(ws, i);
      const ss = sessionsBetween(d, f.addDays(d, 1));
      const isToday = f.sameDay(d, now);
      const cell = h('button', { class: 'wd' + (ss.length ? ' trained' : '') + (isToday ? ' today' : '') + (d > now ? ' future' : '') },
        h('span', { class: 'wd-l', text: f.narrow(d) }),
        h('span', { class: 'wd-n', text: String(new Date(d).getDate()) }),
        h('span', { class: 'wd-dot' }));
      if (ss.length) cell.addEventListener('click', () => push(SessionScreen(ss[ss.length - 1].id)));
      strip.append(cell);
    }
    return strip;
  }

  function statsRow(now) {
    const ws = weekStart(now);
    const n = sessionsBetween(ws, f.addDays(ws, 7)).length;
    const bw = bodySeries();
    const lastBw = bw[bw.length - 1];
    const weigh = h('button', { class: 'stat tap' },
      h('div', { class: 'stat-val', text: lastBw ? f.w(lastBw.kg) : '–' }),
      h('div', { class: 'stat-label', text: lastBw ? `Body ${f.unit()}` : 'Log weight' }));
    weigh.addEventListener('click', () => logWeight());
    return h('div', { class: 'stats3 card' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: `${n}/${workDays()}` }), h('div', { class: 'stat-label', text: 'This week' })),
      h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: String(streak(now)) }), h('div', { class: 'stat-label', text: 'Week streak' })),
      weigh);
  }

  function chooseDay() {
    const list = h('div', { class: 'card list flat' });
    const sh = sheet({ title: 'Start a workout', body: list });
    store.data.program.days.forEach((d, i) => {
      if (d.rest) return;
      const row = h('button', { class: 'li' },
        h('span', { class: 'li-num', text: String(i + 1) }),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: d.name }), h('div', { class: 'li-sub', text: `${f.plural(d.items.length, 'exercise')} · ≈${estMinutes(d)} min` })),
        ic('play', 18));
      row.addEventListener('click', () => { sh.close(); startWorkout(d); });
      list.append(row);
    });
    const empty = h('button', { class: 'li' }, h('span', { class: 'li-num' }, ic('plus', 16)), h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: 'Empty workout' }), h('div', { class: 'li-sub', text: 'Add exercises as you go' })));
    empty.addEventListener('click', () => { sh.close(); startWorkout(null); });
    list.append(empty);
  }

  return { el: pg.el, render };
}
