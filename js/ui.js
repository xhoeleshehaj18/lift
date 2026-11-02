// DOM helpers, icons and device feedback (haptics, sound, screen wake).
import { store } from './store.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'ref') v(el);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

const P = {
  train: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  history: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  progress: '<path d="M3.5 17.5l5.5-5.5 4 4 7.5-7.5"/><path d="M15.5 8.5h5v5"/>',
  program: '<path d="M9.5 6.5h10.5M9.5 12h10.5M9.5 17.5h10.5"/><path d="M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5" stroke-width="2.4"/>',
  settings: '<path d="M4 7.5h9M18 7.5h2M4 16.5h2M11 16.5h9"/><circle cx="15.5" cy="7.5" r="2.2"/><circle cx="8.5" cy="16.5" r="2.2"/>',
  chevL: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevR: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  chevD: '<path d="M5.5 9L12 15.5 18.5 9"/>',
  chevU: '<path d="M5.5 15L12 8.5l6.5 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  more: '<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="2.6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  grip: '<path d="M9 6.5h.01M15 6.5h.01M9 12h.01M15 12h.01M9 17.5h.01M15 17.5h.01" stroke-width="2.4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  note: '<path d="M14.5 5.5l4 4M4.5 19.5l1-4.5L16 4.5a1.4 1.4 0 012 0l1.5 1.5a1.4 1.4 0 010 2L9 18.5z"/>',
  swap: '<path d="M7 4.5L4 7.5l3 3M4 7.5h13M17 13.5l3 3-3 3M20 16.5H7"/>',
  skip: '<path d="M6 6.5l8 5.5-8 5.5zM18 6.5v11"/>',
  up: '<path d="M12 19V5.5M6 11.5l6-6 6 6"/>',
  down: '<path d="M12 5v13.5M6 12.5l6 6 6-6"/>',
  flat: '<path d="M5 12h12.5M12.5 7l5 5-5 5"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.5 10a5 5 0 017 0M12 10.5l1.5-2"/>',
  share: '<path d="M12 15V4M8 7.5L12 3.5l4 4M6 11v8.5h12V11"/>',
  import: '<path d="M12 4v11M8 11l4 4 4-4M6 19.5h12"/>',
  bolt: '<path d="M13 3.5L6 13.5h5.5L10.5 20.5 18 10h-5.5z"/>',
  list: '<path d="M4 6.5h16M4 12h16M4 17.5h10"/>',
  edit: '<path d="M4.5 19.5h15M6.5 15.5l9.5-9.5a1.8 1.8 0 012.5 2.5L9 18H6.5z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
};

export const svg = (name, size = 22) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`;

export function ic(name, size) {
  const t = document.createElement('template');
  t.innerHTML = svg(name, size);
  return t.content.firstChild;
}

// --- haptics: Android vibrates; iOS 18+ ticks when a switch control toggles.
export function haptic() {
  if (!store.settings.haptics) return;
  try {
    if (navigator.vibrate) {
      navigator.vibrate(8);
      return;
    }
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  } catch {}
}

// --- sound: Web Audio unlocked on a tap, mixed with whatever music is playing.
let actx = null;
export function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== 'running') actx.resume();
    const b = actx.createBuffer(1, 1, 22050);
    const src = actx.createBufferSource();
    src.buffer = b;
    src.connect(actx.destination);
    src.start(0);
  } catch {}
}

export function chime() {
  if (!store.settings.sound || !actx) return;
  try {
    if (actx.state !== 'running') actx.resume();
    const t = actx.currentTime + 0.02;
    [[987.77, 0], [1318.51, 0.16]].forEach(([f, dt]) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.3, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.45);
      o.connect(g).connect(actx.destination);
      o.start(t + dt);
      o.stop(t + dt + 0.5);
    });
  } catch {}
}

// --- keep the screen on during a workout
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && store.settings.keepAwake && 'wakeLock' in navigator && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    } else if (!on && lock) {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch {
    lock = null;
  }
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Run after a CSS transition on el finishes (with a timeout fallback).
export function afterTransition(el, ms, fn) {
  let done = false;
  const end = (e) => {
    if (done || (e && e.target !== el)) return;
    done = true;
    el.removeEventListener('transitionend', end);
    fn();
  };
  el.addEventListener('transitionend', end);
  setTimeout(end, ms + 80);
}

export function toggle(on, onChange) {
  const el = h('button', { class: 'toggle' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) }, h('span'));
  el.addEventListener('click', () => {
    on = !on;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
    haptic();
    onChange(on);
  });
  return el;
}

export function segmented(options, value, onChange, cls = '') {
  const el = h('div', { class: 'seg ' + cls, role: 'tablist' });
  const thumb = h('div', { class: 'seg-thumb' });
  el.append(thumb);
  const btns = options.map(([v, label]) => {
    const b = h('button', { class: 'seg-btn', role: 'tab', text: label });
    b.addEventListener('click', () => {
      if (v === value) return;
      value = v;
      place();
      haptic();
      onChange(v);
    });
    el.append(b);
    return b;
  });
  function place() {
    const i = Math.max(0, options.findIndex(([v]) => v === value));
    btns.forEach((b, j) => b.classList.toggle('on', i === j));
    thumb.style.width = `calc((100% - 4px) / ${options.length})`;
    thumb.style.transform = `translateX(${i * 100}%)`;
  }
  place();
  return el;
}

// Hold-to-repeat for stepper chevrons.
export function repeatPress(btn, fn) {
  let t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    fn();
    haptic();
    t1 = setTimeout(() => (t2 = setInterval(fn, 90)), 420);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
