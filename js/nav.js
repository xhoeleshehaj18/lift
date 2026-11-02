// Tabs, a navigation stack per tab, push/pop with edge-swipe back,
// and the page scaffold (bar + large title) every screen uses.
import { h, ic, haptic, afterTransition, nextFrame } from './ui.js';

const stacks = {};
const sections = {};
const buttons = {};
let current = null;

export const currentTab = () => current;
const top = (tab = current) => stacks[tab][stacks[tab].length - 1];

export function initNav(host, tabbar, tabs) {
  for (const [name, label, iconName, make] of tabs) {
    const sec = h('section', { class: 'tab', 'data-tab': name });
    host.append(sec);
    sections[name] = sec;
    stacks[name] = [];
    const root = make();
    root.dirty = true; // rendered the first time its tab is shown
    root.el.classList.add('screen', 'root');
    sec.append(root.el);
    stacks[name].push(root);
    const b = h('button', { class: 'tab-btn', 'aria-label': label }, ic(iconName, 24), h('span', { text: label }));
    b.addEventListener('click', () => switchTab(name));
    tabbar.append(b);
    buttons[name] = b;
  }
  switchTab(tabs[0][0], true);
}

export function switchTab(name, initial = false) {
  if (name === current) {
    const st = stacks[name];
    if (st.length > 1) popTo(name, 1);
    else st[0].el.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (!initial) haptic();
  const prev = current;
  current = name;
  for (const k in sections) {
    sections[k].classList.toggle('active', k === name);
    buttons[k].classList.toggle('on', k === name);
  }
  const t = top(name);
  if (t.dirty) render(t);
  t.onShow?.();
  if (prev) top(prev).onHide?.();
}

function render(s) {
  s.dirty = false;
  s.render?.();
}

export function push(screen) {
  const st = stacks[current];
  const below = top();
  screen.el.classList.add('screen', 'pushed', 'enter');
  sections[current].append(screen.el);
  st.push(screen);
  render(screen);
  enableSwipeBack(screen);
  nextFrame().then(() => {
    screen.el.classList.remove('enter');
    below.el.classList.add('covered');
  });
  below.onHide?.();
  screen.onShow?.();
}

export function pop() {
  const st = stacks[current];
  if (st.length < 2) return;
  const gone = st.pop();
  const back = top();
  gone.el.classList.add('enter');
  back.el.classList.remove('covered');
  if (back.dirty) render(back);
  gone.onHide?.();
  back.onShow?.();
  afterTransition(gone.el, 450, () => {
    gone.el.remove();
    gone.destroy?.();
  });
}

function popTo(tab, depth) {
  const st = stacks[tab];
  while (st.length > depth + 1) {
    const s = st.splice(depth, 1)[0];
    s.el.remove();
    s.destroy?.();
  }
  if (tab === current) pop();
}

// Re-render what's visible now; everything else re-renders when it's shown.
export function refresh() {
  for (const tab in stacks) {
    for (const s of stacks[tab]) {
      if (tab === current && s === top(tab)) render(s);
      else s.dirty = true;
    }
  }
}

function enableSwipeBack(screen) {
  const el = screen.el;
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, active = false, decided = false, prev = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.clientX > 28) return;
    const st = stacks[current];
    if (st[st.length - 1] !== screen || st.length < 2) return;
    prev = st[st.length - 2].el;
    x0 = e.clientX; y0 = e.clientY; t0 = performance.now();
    dx = 0; active = true; decided = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      if (Math.abs(my) > Math.abs(mx) || mx < 0) { active = false; return; }
      decided = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      prev.classList.add('dragging');
    }
    dx = Math.max(0, mx);
    const p = Math.min(1, dx / el.clientWidth);
    el.style.transform = `translate3d(${dx}px,0,0)`;
    prev.style.transform = `translate3d(${-30 + 30 * p}%,0,0)`;
    prev.style.opacity = String(0.4 + 0.6 * p);
  });
  const end = () => {
    if (!active) return;
    active = false;
    if (!decided) return;
    const v = dx / Math.max(1, performance.now() - t0);
    el.classList.remove('dragging');
    prev.classList.remove('dragging');
    el.style.transform = '';
    prev.style.transform = '';
    prev.style.opacity = '';
    if (dx > el.clientWidth * 0.35 || (dx > 30 && v > 0.45)) pop();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// Page scaffold: sticky bar (back, compact title, actions) + large title.
export function page({ title = '', eyebrow = '', back = false, right = null, large = true } = {}) {
  const small = h('div', { class: 'bar-title', text: title });
  const left = back ? h('button', { class: 'icon-btn back', 'aria-label': 'Back' }, ic('chevL', 26)) : h('div', { class: 'bar-spacer' });
  if (back) left.addEventListener('click', () => pop());
  const actions = h('div', { class: 'bar-actions' }, right);
  const bar = h('header', { class: 'bar' + (large ? '' : ' solid') }, left, small, actions);
  const titleEl = large ? h('h1', { class: 'large-title', text: title }) : null;
  const eyebrowEl = large ? h('div', { class: 'eyebrow', text: eyebrow }) : null;
  const content = h('div', { class: 'content' });
  const el = h('div', { class: 'page' }, bar, h('div', { class: 'page-head' }, eyebrowEl, titleEl), content);
  el.addEventListener('scroll', () => bar.classList.toggle('scrolled', el.scrollTop > (large ? 44 : 2)), { passive: true });
  return {
    el,
    bar,
    content,
    setTitle(t) { small.textContent = t; if (titleEl) titleEl.textContent = t; },
    setEyebrow(t) { if (eyebrowEl) eyebrowEl.textContent = t; },
    setRight(node) { actions.textContent = ''; if (node) actions.append(node); },
  };
}
