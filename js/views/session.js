// A finished workout: stats, comparison, records and sets. Used by the
// post-workout summary and by History, where sets can be edited.
import { store } from '../store.js';
import { h, ic, haptic, segmented } from '../ui.js';
import { sheet, keypad, editText } from '../sheets.js';
import * as f from '../fmt.js';
import { sessionStats, sessionPRs, e1rm, exName } from '../logic.js';
import { stepRow } from './picker.js';

export function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-val', text: value }), h('div', { class: 'stat-label', text: label }), sub ? h('div', { class: 'stat-sub', text: sub }) : null);
}

function previousOf(s) {
  if (!s.dayId) return null;
  const ss = store.data.sessions;
  for (let i = ss.length - 1; i >= 0; i--) {
    if (ss[i].dayId === s.dayId && ss[i].startedAt < s.startedAt && ss[i].id !== s.id) return ss[i];
  }
  return null;
}

const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : 0);

export function sessionView(s, { editable = false, onChange } = {}) {
  const st = sessionStats(s);
  const prs = sessionPRs(s);
  const prev = previousOf(s);
  const out = h('div', { class: 'session' });

  out.append(h('div', { class: 'stats3' },
    stat('Duration', f.hm(st.duration)),
    stat('Sets', String(st.sets)),
    stat('Volume', f.big(f.toDisp(st.volume)), f.unit())));

  if (prev) {
    const ps = sessionStats(prev);
    const dv = pct(st.volume, ps.volume);
    const word = dv > 0 ? `+${dv}%` : dv < 0 ? `−${Math.abs(dv)}%` : 'same';
    out.append(h('div', { class: 'compare' },
      ic(dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat', 18),
      h('span', { text: `Volume ${word} vs last ${s.dayName} (${f.short(prev.startedAt)})` })));
  }

  if (prs.length) {
    out.append(h('div', { class: 'section-label', text: prs.length === 1 ? 'New record' : `${prs.length} new records` }));
    out.append(h('div', { class: 'card list' }, prs.map((p) =>
      h('div', { class: 'li' },
        h('span', { class: 'badge', text: 'PR' }),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: exName(p.exId) }),
          h('div', { class: 'li-sub', text: `${f.w(p.w)} × ${p.r} · est. 1RM ${f.wu1(e1rm(p.w, p.r))}` }))))));
  }

  out.append(h('div', { class: 'section-label', text: 'Exercises' }));
  const prSets = new Set(prs.map((p) => `${p.item}:${p.set}`));
  s.items.forEach((it, ii) => {
    const ex = store.data.exercises[it.exId];
    const card = h('div', { class: 'card ex-card' }, h('div', { class: 'ex-card-name', text: exName(it.exId) }));
    it.sets.forEach((x, i) => {
      if (!x.done) return;
      const row = h(editable ? 'button' : 'div', { class: 'set-line' },
        h('span', { class: 'sl-i', text: String(i + 1) }),
        h('span', { class: 'sl-v', text: f.setText(x, ex) }),
        x.rir != null ? h('span', { class: 'sl-rir', text: `RIR ${x.rir === 4 ? '4+' : x.rir}` }) : null,
        prSets.has(`${ii}:${i}`) ? h('span', { class: 'badge sm', text: 'PR' }) : null);
      if (editable) {
        row.addEventListener('click', () => editSet(x, ex, {
          onSave: () => { store.update(() => {}); onChange?.(); },
          onDelete: () => {
            it.sets.splice(i, 1);
            if (!it.sets.length) s.items.splice(s.items.indexOf(it), 1);
            store.update(() => {});
            onChange?.();
          },
        }));
      }
      card.append(row);
    });
    out.append(card);
  });

  out.append(h('div', { class: 'section-label', text: 'Notes' }));
  const note = h('button', { class: 'card note-card' + (s.notes ? '' : ' is-empty') }, ic('note', 20), h('span', { text: s.notes || 'How did it feel?' }));
  note.addEventListener('click', () => editText({
    title: 'Workout notes', value: s.notes, placeholder: 'Energy, sleep, anything worth remembering',
    onSave: (v) => { s.notes = v; store.update(() => {}); onChange?.(); },
  }));
  out.append(note);
  return out;
}

// Edit one logged set: weight, reps, RIR.
export function editSet(x, ex, { onSave, onDelete, title = 'Edit set' }) {
  let wv = f.round2(f.toDisp(x.w || 0)), r = x.r || 0, rir = x.rir;
  const stp = f.step(ex);
  const wRow = stepRow(`Weight (${f.unit()})`, wv, { min: 0, max: 2000, step: stp, fmt: f.num, onChange: (v) => (wv = v) });
  const rRow = stepRow('Reps', r, { min: 0, max: 100, step: 1, onChange: (v) => (r = v) });
  const valEl = wRow.querySelector('.sr-val');
  valEl.classList.add('tap');
  valEl.addEventListener('click', () => keypad({ label: `Weight (${f.unit()})`, value: wv, suffix: f.unit(), onDone: (v) => { wv = v; valEl.textContent = f.num(v); } }));
  const rirSeg = segmented([[null, '–'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']], rir, (v) => (rir = v), 'small');
  const save = h('button', { class: 'btn primary block', text: 'Save' });
  const del = onDelete ? h('button', { class: 'btn ghost block danger-text', text: 'Delete set' }) : null;
  const sh = sheet({
    title,
    body: h('div', { class: 'form-card' }, wRow, rRow, store.settings.rir ? h('div', { class: 'form-row col' }, h('span', { class: 'fr-label', text: 'Reps in reserve' }), rirSeg) : null),
    footer: [save, del],
  });
  save.addEventListener('click', () => {
    x.w = f.fromDisp(wv);
    x.r = r;
    x.rir = rir;
    haptic();
    sh.close();
    onSave?.();
  });
  del?.addEventListener('click', () => { sh.close(); onDelete(); });
}
