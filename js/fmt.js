// Units and formatting. Weights are stored in kg and converted for display.
import { store } from './store.js';

export const LB = 2.2046226218;
export const unit = () => store.settings.unit;
export const toDisp = (kg) => (unit() === 'lb' ? kg * LB : kg);
export const fromDisp = (v) => (unit() === 'lb' ? v / LB : v);
export const round2 = (v) => Math.round(v * 100) / 100;

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
export const DECIMAL = (1.5).toLocaleString().charAt(1);

const nfc = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const num = (v) => (v == null || isNaN(v) ? '–' : nf.format(round2(v)));
export const num1 = (v) => (v == null || isNaN(v) ? '–' : nf1.format(v));
export const int = (v) => (v == null || isNaN(v) ? '–' : nf0.format(v));
// stat tiles: 145,113 -> 145K so big totals fit a third of the screen
export const big = (v) => (v != null && v >= 100000 ? nfc.format(v) : int(v));

// Plate-sized values (multiples of 0.25) keep their decimals; values converted
// from the other unit (55 kg = 121.254 lb) get one.
const tidy = (v) => (Math.abs(v * 4 - Math.round(v * 4)) < 1e-3 ? v : Math.round(v * 10) / 10);
// weight in kg -> "62.5" (display unit, no label)
export const w = (kg) => num(tidy(toDisp(kg || 0)));
export const wu = (kg) => `${w(kg)} ${unit()}`;
// estimates (1RM, trend) to one decimal
export const wu1 = (kg) => `${num1(toDisp(kg || 0))} ${unit()}`;
// large totals (volume) without decimals
export const vol = (kg) => `${int(toDisp(kg))} ${unit()}`;

// weight step for an exercise, in display units
export function step(ex) {
  if (ex?.inc) {
    const v = ex.inc.u === unit() ? ex.inc.v : ex.inc.u === 'kg' ? ex.inc.v * LB : ex.inc.v / LB;
    return round2(v);
  }
  return unit() === 'kg' ? 2.5 : 5;
}

export function setText(s, ex) {
  const reps = s.r ?? '–';
  if (ex?.bodyweight && !s.w) return `${reps} reps`;
  return `${w(s.w)} × ${reps}`;
}

// --- time
export function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function dur(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
// stat tiles: "45 min", "1 h 05"
export function hm(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
export const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
export const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
export const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

const fDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const fShort = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const fWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const fNarrow = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

export const day = (ts) => fDay.format(ts);
export const longDay = (ts) => fLong.format(ts);
export const short = (ts) => fShort.format(ts);
export const month = (ts) => fMonth.format(ts);
export const time = (ts) => fTime.format(ts);
export const weekday = (ts) => fWeekday.format(ts);
export const narrow = (ts) => fNarrow.format(ts);

export function rel(ts, now = Date.now()) {
  const d = daysBetween(ts, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return weekday(ts);
  return short(ts);
}

export function inDays(n, now = Date.now()) {
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return weekday(addDays(now, n));
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
// U+2060 keeps "6–10" from wrapping at the dash
export const range = (t) => (t.repMin === t.repMax ? `${t.repMin}` : `${t.repMin}⁠–⁠${t.repMax}`);
export const setsLabel = (t) => (t.setsMin < t.sets ? `${t.setsMin}⁠–⁠${t.sets}` : `${t.sets}`);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
