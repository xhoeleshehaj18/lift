// Bottom sheets, keypad, confirmations, action lists and toasts.
import { h, ic, haptic, nextFrame } from './ui.js';
import { DECIMAL } from './fmt.js';

const layer = () => document.getElementById('sheets');
const open = [];

// Keep sheets above the iOS keyboard.
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}

export function sheet({ title, body, footer, cls = '', onClose } = {}) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const head = h('div', { class: 'sheet-top' }, h('div', { class: 'sheet-grip' }), title ? h('div', { class: 'sheet-title', text: title }) : null);
  const bodyEl = h('div', { class: 'sheet-body' }, body);
  const panel = h('div', { class: 'sheet ' + cls, role: 'dialog', 'aria-modal': 'true' }, head, bodyEl, footer ? h('div', { class: 'sheet-foot' }, footer) : null);
  const root = h('div', { class: 'sheet-root' }, backdrop, panel);
  let closed = false;

  function close(result) {
    if (closed) return;
    closed = true;
    open.splice(open.indexOf(api), 1);
    root.classList.remove('open');
    panel.style.transition = '';
    panel.style.transform = '';
    setTimeout(() => root.remove(), 420);
    onClose?.(result);
  }

  backdrop.addEventListener('click', () => close());

  // drag the top area down to dismiss
  let y0 = 0, dy = 0, t0 = 0, dragging = false;
  head.addEventListener('pointerdown', (e) => {
    dragging = true;
    y0 = e.clientY;
    dy = 0;
    t0 = performance.now();
    head.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  });
  head.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const v = dy / Math.max(1, performance.now() - t0);
    panel.style.transition = '';
    if (dy > 110 || (dy > 20 && v > 0.6)) close();
    else panel.style.transform = '';
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);

  layer().append(root);
  const api = { root, panel, body: bodyEl, close };
  open.push(api);
  nextFrame().then(() => root.classList.add('open'));
  return api;
}

export const closeAllSheets = () => [...open].forEach((s) => s.close());
export const topSheet = () => open[open.length - 1];

export function keypad({ label, value, suffix = '', decimal = true, onDone }) {
  let s = value == null || value === 0 ? '' : String(value);
  let fresh = true;
  const out = h('div', { class: 'kp-num' });
  const caret = h('span', { class: 'kp-caret' });
  const valueEl = h('div', { class: 'kp-display' }, out, caret, suffix ? h('span', { class: 'kp-suffix', text: suffix }) : null);
  const render = () => {
    out.textContent = s === '' ? '0' : s.replace('.', DECIMAL);
    out.classList.toggle('dim', s === '');
    valueEl.classList.toggle('fresh', fresh && s !== '');
  };

  function press(k) {
    haptic();
    if (k === 'del') {
      s = fresh ? '' : s.slice(0, -1);
      fresh = false;
    } else {
      if (fresh) s = '';
      fresh = false;
      if (k === '.') {
        if (s.includes('.')) return;
        s = (s || '0') + '.';
      } else {
        if (s.replace('.', '').length >= 6) return;
        if (s.includes('.') && s.split('.')[1].length >= 2) return;
        s = s === '0' ? k : s + k;
      }
    }
    render();
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : '', '0', 'del'];
  const grid = h('div', { class: 'kp-grid' }, keys.map((k) => {
    if (!k) return h('div');
    const b = h('button', { class: 'kp-key' + (k === 'del' ? ' del' : '') }, k === 'del' ? ic('chevL', 24) : k === '.' ? DECIMAL : k);
    b.addEventListener('click', () => press(k));
    return b;
  }));
  const done = h('button', { class: 'btn primary block', text: 'Done' });
  const sh = sheet({ title: label, body: [valueEl, grid], footer: done, cls: 'kp' });
  done.addEventListener('click', () => {
    const n = parseFloat(s);
    sh.close();
    onDone?.(isNaN(n) ? 0 : n);
  });
  render();
  return sh;
}

export function confirm({ title, message, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const yes = h('button', { class: 'btn block ' + (danger ? 'danger' : 'primary'), text: ok });
    const no = h('button', { class: 'btn block ghost', text: cancel });
    const sh = sheet({
      title,
      body: message ? h('p', { class: 'sheet-msg', text: message }) : null,
      footer: [yes, no],
      onClose: () => resolve(result),
    });
    yes.addEventListener('click', () => { result = true; haptic(); sh.close(); });
    no.addEventListener('click', () => sh.close());
  });
}

export function actions({ title, items }) {
  const list = h('div', { class: 'act-list' });
  const sh = sheet({ title, body: list, cls: 'acts' });
  for (const it of items.filter(Boolean)) {
    const b = h('button', { class: 'act' + (it.danger ? ' danger' : '') },
      it.icon ? ic(it.icon, 22) : null,
      h('span', { class: 'act-label' }, it.label, it.sub ? h('small', { text: it.sub }) : null));
    b.addEventListener('click', () => { sh.close(); it.onSelect?.(); });
    list.append(b);
  }
  return sh;
}

export function editText({ title, value = '', placeholder = '', multiline = true, onSave }) {
  const input = multiline
    ? h('textarea', { class: 'field area', rows: '4', placeholder })
    : h('input', { class: 'field', type: 'text', placeholder, enterkeyhint: 'done' });
  input.value = value;
  const save = h('button', { class: 'btn primary block', text: 'Save' });
  const sh = sheet({ title, body: input, footer: save, cls: 'text' });
  const commit = () => { sh.close(); onSave?.(input.value.trim()); };
  save.addEventListener('click', commit);
  if (!multiline) input.addEventListener('keydown', (e) => e.key === 'Enter' && commit());
  setTimeout(() => input.focus(), 60);
  return sh;
}

let toastTimer = 0;
export function toast(msg, { action, onAction, ms = 2600 } = {}) {
  const host = document.getElementById('toasts');
  host.textContent = '';
  const btn = action ? h('button', { class: 'toast-act', text: action }) : null;
  const el = h('div', { class: 'toast' }, h('span', { text: msg }), btn);
  host.append(el);
  btn?.addEventListener('click', () => { el.classList.remove('show'); onAction?.(); });
  nextFrame().then(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, ms);
}
