// Settings, theme, and backup export/import.
import { store, isValidBackup } from '../store.js';
import { h, ic, toggle, segmented, haptic } from '../ui.js';
import { page } from '../nav.js';
import { confirm, toast } from '../sheets.js';
import * as f from '../fmt.js';
import { stepRow } from './picker.js';

// Shown at the bottom of Settings; keep in step with VERSION in sw.js.
export const VERSION = '1.0.0';

export function applyTheme() {
  const t = store.settings.theme;
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#ffffff'));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

const set = (k, v) => store.update((d) => { d.settings[k] = v; }, 'settings');

export function SettingsScreen() {
  const pg = page({ title: 'Settings', back: true });

  function row(label, sub, control) {
    return h('div', { class: 'form-row' }, h('span', { class: 'fr-label' }, label, sub ? h('small', { text: sub }) : null), control);
  }
  function colRow(label, control) {
    return h('div', { class: 'form-row col' }, h('span', { class: 'fr-label', text: label }), control);
  }
  function linkRow(label, icon, fn, cls = '') {
    const b = h('button', { class: 'li ' + cls }, h('span', { class: 'li-icon' }, ic(icon, 20)), h('div', { class: 'li-main' }, h('div', { class: 'li-title', text: label })));
    b.addEventListener('click', fn);
    return b;
  }

  function render() {
    const s = store.settings;
    const c = pg.content;
    c.textContent = '';

    c.append(h('div', { class: 'section-label', text: 'Display' }));
    c.append(h('div', { class: 'form-card' },
      colRow('Units', segmented([['kg', 'Kilograms'], ['lb', 'Pounds']], s.unit, (v) => set('unit', v))),
      colRow('Appearance', segmented([['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']], s.theme, (v) => { set('theme', v); applyTheme(); })),
      colRow('Week starts on', segmented([[1, 'Monday'], [0, 'Sunday']], s.weekStart, (v) => set('weekStart', v)))));

    c.append(h('div', { class: 'section-label', text: 'Workout' }));
    c.append(h('div', { class: 'form-card' },
      row('Overload coach', 'Suggests weight and reps from your rep ranges', toggle(s.coach, (v) => set('coach', v))),
      row('Log RIR', 'Reps in reserve after each set', toggle(s.rir, (v) => set('rir', v))),
      stepRow('Default rest', s.restDefault, { min: 15, max: 600, step: 15, fmt: f.clock, onChange: (v) => set('restDefault', v) }),
      row('Rest timer sound', 'Plays when rest is over, if the ringer is on', toggle(s.sound, (v) => set('sound', v))),
      row('Haptics', null, toggle(s.haptics, (v) => set('haptics', v))),
      row('Keep screen awake', 'While a workout is running', toggle(s.keepAwake, (v) => set('keepAwake', v)))));

    c.append(h('div', { class: 'section-label', text: 'Your data' }));
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
    fileIn.addEventListener('change', () => importFile(fileIn));
    c.append(h('div', { class: 'card list' },
      linkRow('Export backup', 'share', exportJSON),
      linkRow('Export as spreadsheet (CSV)', 'share', exportCSV),
      linkRow('Restore from backup', 'import', () => fileIn.click()),
      fileIn));
    const kb = Math.round((localStorage.getItem('lift.data.v1') || '').length / 1024);
    c.append(h('p', { class: 'foot-note', text: `Everything is stored on this iPhone (${f.plural(store.data.sessions.length, 'workout')}, ${kb} KB). Deleting the app from your Home Screen deletes it too, so export a backup to Files or iCloud Drive now and then.` }));

    c.append(h('div', { class: 'card list' }, linkRow('Erase all data', 'trash', erase, 'danger')));
    c.append(h('p', { class: 'foot-note center', text: `Lift ${VERSION}` }));
  }

  async function erase() {
    if (!(await confirm({ title: 'Erase everything?', message: 'Workouts, body weight, program changes and settings will be deleted from this device. Export a backup first if you might want them back.', ok: 'Erase all data', danger: true }))) return;
    store.reset();
    applyTheme();
    toast('All data erased');
  }

  return { el: pg.el, render };
}

async function share(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportJSON() {
  haptic();
  share(new Blob([JSON.stringify(store.data)], { type: 'application/json' }), `lift-backup-${f.dayKey(Date.now())}.json`);
}

function exportCSV() {
  haptic();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['date', 'time', 'workout', 'exercise', 'set', `weight_${f.unit()}`, 'reps', 'rir'].join(',')];
  for (const s of store.data.sessions) {
    for (const it of s.items) {
      it.sets.forEach((x, i) => {
        if (!x.done) return;
        rows.push([f.dayKey(s.startedAt), q(f.time(s.startedAt)), q(s.dayName), q(store.data.exercises[it.exId]?.name ?? it.exId), i + 1, f.round2(f.toDisp(x.w || 0)), x.r ?? '', x.rir ?? ''].join(','));
      });
    }
  }
  share(new Blob([rows.join('\n')], { type: 'text/csv' }), `lift-workouts-${f.dayKey(Date.now())}.csv`);
}

async function importFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let d = null;
  try { d = JSON.parse(await file.text()); } catch { d = null; }
  if (!isValidBackup(d)) {
    toast('That file isn’t a Lift backup');
    return;
  }
  const n = d.sessions.length;
  const ok = await confirm({
    title: 'Restore this backup?',
    message: `It has ${f.plural(n, 'workout')}${n ? `, the latest on ${f.day(d.sessions[n - 1].startedAt)}` : ''}. Everything currently on this device will be replaced.`,
    ok: 'Restore', danger: true,
  });
  if (!ok) return;
  store.replaceAll(d);
  applyTheme();
  toast('Backup restored');
}
