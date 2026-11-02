// Exercise picker and the exercise create/edit form.
import { store, uid } from '../store.js';
import { MUSCLES } from '../seed.js';
import { h, ic, haptic, toggle, segmented, repeatPress } from '../ui.js';
import { sheet, toast } from '../sheets.js';
import { clock, unit } from '../fmt.js';

export function pickExercise({ title = 'Add exercise', onPick }) {
  const search = h('input', { class: 'field search', type: 'search', placeholder: 'Search exercises', autocomplete: 'off', enterkeyhint: 'search' });
  const list = h('div', { class: 'pick-list' });
  const create = h('button', { class: 'row-btn' }, ic('plus', 20), h('span', { text: 'New exercise' }));
  const sh = sheet({ title, body: [search, create, list], cls: 'tall' });
  create.addEventListener('click', () => {
    exerciseForm({
      name: search.value.trim(),
      onSave: (ex) => { sh.close(); onPick(ex.id); },
    });
  });
  const pick = (id) => { haptic(); sh.close(); onPick(id); };

  function render() {
    const q = search.value.trim().toLowerCase();
    list.textContent = '';
    const all = Object.values(store.data.exercises)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const m of Object.keys(MUSCLES)) {
      const group = all.filter((e) => e.primary[0] === m);
      if (!group.length) continue;
      list.append(h('div', { class: 'list-head', text: MUSCLES[m] }));
      for (const e of group) {
        const b = h('button', { class: 'pick-row' },
          h('span', { class: 'pick-name', text: e.name }),
          e.secondary.length ? h('small', { text: e.secondary.map((x) => MUSCLES[x]).join(', ') }) : null);
        b.addEventListener('click', () => pick(e.id));
        list.append(b);
      }
    }
    if (!list.children.length) list.append(h('p', { class: 'empty-note', text: 'No match. Create it as a new exercise.' }));
  }
  search.addEventListener('input', render);
  render();
  return sh;
}

export function stepRow(label, value, { min = 0, max = 999, step = 1, fmt = String, onChange }) {
  const out = h('span', { class: 'sr-val', text: fmt(value) });
  const dec = h('button', { class: 'sr-btn', 'aria-label': 'Decrease' }, ic('minus', 20));
  const inc = h('button', { class: 'sr-btn', 'aria-label': 'Increase' }, ic('plus', 20));
  const set = (v) => {
    v = Math.min(max, Math.max(min, Math.round(v * 100) / 100));
    if (v === value) return;
    value = v;
    out.textContent = fmt(v);
    onChange(v);
  };
  repeatPress(dec, () => set(value - step));
  repeatPress(inc, () => set(value + step));
  return h('div', { class: 'form-row' }, h('span', { class: 'fr-label', text: label }), h('div', { class: 'sr' }, dec, out, inc));
}

function chips(selected, { multi, exclude = [] }, onChange) {
  const wrap = h('div', { class: 'chips' });
  const render = () => {
    wrap.textContent = '';
    for (const [k, label] of Object.entries(MUSCLES)) {
      if (exclude.includes(k)) continue;
      const on = selected.includes(k);
      const b = h('button', { class: 'chip' + (on ? ' on' : ''), text: label });
      b.addEventListener('click', () => {
        haptic();
        if (multi) selected = on ? selected.filter((x) => x !== k) : [...selected, k];
        else selected = [k];
        onChange(selected);
        render();
      });
      wrap.append(b);
    }
  };
  render();
  return { el: wrap, set(exc) { exclude = exc; render(); } };
}

export function exerciseForm({ ex = null, name = '', onSave }) {
  const d = ex ? structuredClone(ex) : { id: 'x-' + uid(), name, primary: ['chest'], secondary: [], bodyweight: false, rest: store.settings.restDefault, inc: null, notes: '' };
  const nameIn = h('input', { class: 'field', type: 'text', placeholder: 'Exercise name', enterkeyhint: 'done' });
  nameIn.value = d.name;
  let sec = null;
  const prim = chips(d.primary, { multi: false }, (v) => {
    d.primary = v;
    d.secondary = d.secondary.filter((x) => x !== v[0]);
    sec.set(v);
  });
  sec = chips(d.secondary, { multi: true, exclude: d.primary }, (v) => (d.secondary = v));
  const u = unit();
  const steps = u === 'kg' ? [1, 1.25, 2.5, 5] : [2.5, 5, 10];
  const cur = d.inc && d.inc.u === u ? d.inc.v : u === 'kg' ? 2.5 : 5;
  const incSeg = segmented(steps.map((s) => [s, String(s).replace('.', (1.5).toLocaleString().charAt(1))]), steps.includes(cur) ? cur : steps[steps.length - 2], (v) => (d.inc = { v, u }), 'small');
  const notes = h('textarea', { class: 'field area', rows: '2', placeholder: 'Seat height, pin, grip…' });
  notes.value = d.notes || '';
  const save = h('button', { class: 'btn primary block', text: ex ? 'Save' : 'Create exercise' });

  const body = [
    h('label', { class: 'form-label', text: 'Name' }), nameIn,
    h('label', { class: 'form-label', text: 'Main muscle' }), prim.el,
    h('label', { class: 'form-label', text: 'Also works' }), sec.el,
    h('div', { class: 'form-card' },
      h('div', { class: 'form-row' }, h('span', { class: 'fr-label', text: 'Bodyweight exercise' }), toggle(d.bodyweight, (v) => (d.bodyweight = v))),
      stepRow('Rest', d.rest, { min: 15, max: 600, step: 15, fmt: clock, onChange: (v) => (d.rest = v) }),
      h('div', { class: 'form-row col' }, h('span', { class: 'fr-label', text: `Weight step (${u})` }), incSeg)),
    h('label', { class: 'form-label', text: 'Notes' }), notes,
  ];
  const sh = sheet({ title: ex ? 'Edit exercise' : 'New exercise', body, footer: save, cls: 'tall' });
  save.addEventListener('click', () => {
    const nm = nameIn.value.trim();
    if (!nm) { nameIn.focus(); toast('Give it a name'); return; }
    d.name = nm;
    d.notes = notes.value.trim();
    store.update((data) => { data.exercises[d.id] = d; });
    sh.close();
    onSave?.(d);
  });
  return sh;
}
