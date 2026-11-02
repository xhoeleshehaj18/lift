// Hand-drawn SVG charts: a scrubbable line chart and a sparkline.
import { h } from './ui.js';
import { short } from './fmt.js';

const NS = 'http://www.w3.org/2000/svg';
let gid = 0;

// Monotone cubic path through points (no overshoot between sessions).
function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length, dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0;
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!m[i]) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += `C${pts[i][0] + h3},${pts[i][1] + t[i] * h3} ${pts[i + 1][0] - h3},${pts[i + 1][1] - t[i + 1] * h3} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

const el = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

// data: [{t, ...}], y(d) -> number, line(d) -> optional smoothed series drawn as the line
export function lineChart({ data, y, line = null, fmt = String, height = 190, onScrub = null, dots = false }) {
  const wrap = h('div', { class: 'chart', style: { height: height + 'px' } });
  const tip = h('div', { class: 'chart-tip' });
  wrap.append(tip);
  const id = 'g' + ++gid;
  let svg = null, pts = [], drawnW = 0;

  function draw() {
    const W = wrap.clientWidth;
    if (!W || W === drawnW) return;
    drawnW = W;
    svg?.remove();
    const H = height, top = 14, bot = 24;
    svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const vals = data.map(y).concat(line ? data.map(line) : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const t0 = data[0].t, t1 = data[data.length - 1].t;
    const X = (t) => (t1 === t0 ? W / 2 : 6 + ((t - t0) / (t1 - t0)) * (W - 12));
    const Y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);

    const defs = el('defs', {});
    const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(el('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '0.16' }));
    grad.append(el('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }));
    defs.append(grad);
    svg.append(defs);

    for (let i = 0; i <= 2; i++) {
      const v = lo + pad + ((hi - lo - 2 * pad) * i) / 2;
      const yy = Y(v);
      svg.append(el('line', { x1: 0, x2: W, y1: yy, y2: yy, class: 'grid' }));
      const lab = el('text', { x: W - 2, y: yy - 5, class: 'axis', 'text-anchor': 'end' });
      lab.textContent = fmt(v);
      svg.append(lab);
    }
    const dl = el('text', { x: 2, y: H - 6, class: 'axis' });
    dl.textContent = short(t0);
    svg.append(dl);
    if (t1 !== t0) {
      const dr = el('text', { x: W - 2, y: H - 6, class: 'axis', 'text-anchor': 'end' });
      dr.textContent = short(t1);
      svg.append(dr);
    }

    const acc = line || y;
    pts = data.map((d) => [X(d.t), Y(acc(d)), d]);
    const p = smoothPath(pts);
    if (pts.length > 1) {
      svg.append(el('path', { d: `${p}L${pts[pts.length - 1][0]},${H - bot}L${pts[0][0]},${H - bot}Z`, fill: `url(#${id})`, class: 'area' }));
    }
    const path = el('path', { d: p, class: 'line', pathLength: '1' });
    const marks = (cls, r) => data.forEach((d) => svg.append(el('circle', { cx: X(d.t), cy: Y(y(d)), r, class: cls })));
    if (line) {
      marks('raw', 2.2);
      svg.append(path);
    } else {
      svg.append(path);
      if (dots && data.length > 1) marks('pt', 2.6);
    }
    const last = pts[pts.length - 1];
    svg.append(el('circle', { cx: last[0], cy: last[1], r: 7, class: 'halo' }));
    svg.append(el('circle', { cx: last[0], cy: last[1], r: 3.5, class: 'end' }));
    const cross = el('line', { x1: 0, x2: 0, y1: top - 6, y2: H - bot, class: 'cross' });
    const knob = el('circle', { cx: 0, cy: 0, r: 4.5, class: 'knob' });
    svg.append(cross, knob);
    wrap.append(svg);
    requestAnimationFrame(() => svg.classList.add('in'));

    const at = (clientX) => {
      const x = clientX - wrap.getBoundingClientRect().left;
      let best = pts[0];
      for (const q of pts) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q;
      return best;
    };
    const show = (e) => {
      const q = at(e.clientX);
      cross.setAttribute('x1', q[0]); cross.setAttribute('x2', q[0]);
      knob.setAttribute('cx', q[0]); knob.setAttribute('cy', q[1]);
      svg.classList.add('scrub');
      tip.textContent = `${fmt(y(q[2]))} · ${short(q[2].t)}`;
      tip.style.transform = `translateX(${Math.max(0, Math.min(W - tip.offsetWidth, q[0] - tip.offsetWidth / 2))}px)`;
      tip.classList.add('on');
      onScrub?.(q[2]);
    };
    const hide = () => {
      svg.classList.remove('scrub');
      tip.classList.remove('on');
      onScrub?.(null);
    };
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointermove', (e) => (e.pointerType === 'mouse' && !e.buttons ? null : show(e)));
    svg.addEventListener('pointerup', hide);
    svg.addEventListener('pointercancel', hide);
    svg.addEventListener('pointerleave', hide);
  }

  if (data.length) {
    new ResizeObserver(() => draw()).observe(wrap);
  } else {
    wrap.append(h('div', { class: 'chart-empty', text: 'No data yet' }));
  }
  return wrap;
}

export function sparkline(values, w = 64, hgt = 24) {
  if (values.length < 2) return `<svg class="spark" width="${w}" height="${hgt}"></svg>`;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 2 + (1 - (v - lo) / (hi - lo)) * (hgt - 4)]);
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><path d="${smoothPath(pts)}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2" fill="currentColor"/></svg>`;
}
