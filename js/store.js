// Persistence. Everything lives in localStorage on the device:
// one key for the library/program/history, one for the workout in progress.
import { seedExercises, seedProgram } from './seed.js';

const KEY = 'lift.data.v1';
const ACTIVE_KEY = 'lift.active.v1';

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  theme: 'system',
  restDefault: 120,
  coach: true,
  rir: true,
  sound: true,
  haptics: true,
  keepAwake: true,
  weekStart: 1,
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function fresh() {
  return {
    v: 1,
    settings: { ...DEFAULT_SETTINGS },
    exercises: seedExercises(),
    program: seedProgram(),
    sessions: [],
    bodyweight: [],
    createdAt: Date.now(),
  };
}

export function isValidBackup(d) {
  return !!d && typeof d === 'object' && d.v === 1 && d.exercises && typeof d.exercises === 'object' &&
    d.program && Array.isArray(d.program.days) && Array.isArray(d.sessions) && Array.isArray(d.bodyweight);
}

const listeners = new Set();
let timer = 0;

export const store = {
  data: null,
  active: null,
  failed: false,

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch { d = null; }
    this.data = isValidBackup(d) ? d : fresh();
    this.data.settings = { ...DEFAULT_SETTINGS, ...this.data.settings };
    try { this.active = JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch { this.active = null; }
    this.flush();
    navigator.storage?.persist?.().catch(() => {});
  },

  flush() {
    clearTimeout(timer);
    timer = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
      this.failed = false;
    } catch {
      this.failed = true;
    }
  },

  persist() {
    clearTimeout(timer);
    timer = setTimeout(() => this.flush(), 120);
  },

  saveActive() {
    try {
      if (this.active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(this.active));
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      this.failed = true;
    }
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit(what = 'data') {
    listeners.forEach((fn) => fn(what));
  },

  update(fn, what = 'data') {
    fn(this.data);
    this.persist();
    this.emit(what);
  },

  get settings() {
    return this.data.settings;
  },

  replaceAll(d) {
    d.settings = { ...DEFAULT_SETTINGS, ...d.settings };
    this.data = d;
    this.flush();
    this.emit('all');
  },

  reset() {
    this.data = fresh();
    this.active = null;
    this.saveActive();
    this.flush();
    this.emit('all');
  },
};

// Make sure a pending debounced write lands before iOS suspends the app.
addEventListener('pagehide', () => timer && store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && timer) store.flush();
});
