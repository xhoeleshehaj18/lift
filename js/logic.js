// Training logic: rotation, overload coach, records, stats.
import { store, uid } from './store.js';
import { unit, w as fw, range, daysBetween, addDays, startOfDay, round2, toDisp, fromDisp, step } from './fmt.js';

export const e1rm = (w, r) => (!w || !r ? 0 : r === 1 ? w : w * (1 + r / 30));
export const doneSets = (item) => item.sets.filter((s) => s.done);
export const exName = (id) => store.data.exercises[id]?.name ?? 'Deleted exercise';

// All logged appearances of an exercise, newest first.
export function exHistory(exId, excludeId = null) {
  const out = [];
  const ss = store.data.sessions;
  for (let i = ss.length - 1; i >= 0; i--) {
    const s = ss[i];
    if (s.id === excludeId) continue;
    for (const item of s.items) {
      if (item.exId !== exId) continue;
      const sets = doneSets(item);
      if (sets.length) out.push({ session: s, item, sets });
    }
  }
  return out;
}

export function bestOf(hist) {
  let e = 0, heavy = 0;
  for (const h of hist) for (const s of h.sets) {
    e = Math.max(e, e1rm(s.w, s.r));
    if (s.r > 0) heavy = Math.max(heavy, s.w || 0);
  }
  return { e1rm: e, heavy };
}

// One weight step up or down, counted in the unit on screen so 135 lb + 5 is exactly 140 lb.
function stepped(kg, ex, dir) {
  return fromDisp(Math.max(0, round2(toDisp(kg) + dir * step(ex))));
}

// Double progression: work inside the rep range, add weight once every set hits the top.
export function coach(target, ex, last, prev) {
  const { repMin, repMax, sets } = target;
  if (!last) {
    return { kind: 'new', w: null, goal: Array(sets).fill(repMin), msg: `First time — pick a weight you can do for ${range(target)}` };
  }
  const topW = Math.max(...last.sets.map((s) => s.w || 0));
  const top = last.sets.filter((s) => (s.w || 0) === topW);
  const reps = top.map((s) => s.r || 0);
  const lastReps = last.sets.map((s) => s.r || 0);
  const goalFrom = (base) => Array.from({ length: sets }, (_, i) => base[i] ?? base[base.length - 1] ?? repMin);
  const rirs = top.map((s) => s.rir).filter((x) => x != null);
  const easy = rirs.length && rirs.every((x) => x >= 3);

  if (ex?.bodyweight && !topW) {
    if (reps.every((r) => r >= repMax)) {
      return { kind: 'up', w: 0, goal: Array(sets).fill(repMax), msg: 'Top of the range — add weight or slow the reps down' };
    }
    return { kind: 'beat', w: 0, goal: goalFrom(lastReps.map((r) => Math.min(repMax, r + 1))), msg: `Beat ${lastReps.join(', ')} reps` };
  }

  if (top.length >= Math.min(sets, target.setsMin ?? sets) && reps.every((r) => r >= repMax)) {
    const nw = stepped(topW, ex, 1);
    return { kind: 'up', w: nw, goal: Array(sets).fill(repMin), msg: `Up to ${fw(nw)} ${unit()} — you hit ${reps.join(', ')} last time` };
  }

  if (reps[0] < repMin) {
    const prevTop = prev ? Math.max(...prev.sets.map((s) => s.w || 0)) : null;
    const prevBelow = prev && prevTop === topW && prev.sets.filter((s) => (s.w || 0) === prevTop)[0]?.r < repMin;
    if (prevBelow) {
      const nw = stepped(topW, ex, -1);
      return { kind: 'down', w: nw, goal: Array(sets).fill(repMin), msg: `Back off to ${fw(nw)} ${unit()} — below ${repMin} reps twice` };
    }
    return { kind: 'hold', w: topW, goal: Array(sets).fill(repMin), msg: `Hold ${fw(topW)} ${unit()} — get every set to ${repMin}+` };
  }

  const goal = goalFrom(lastReps.map((r) => Math.min(repMax, r + 1)));
  const tail = easy ? ' · you had 3+ reps left' : '';
  return { kind: 'beat', w: topW, goal, msg: `Beat ${fw(topW)} × ${lastReps.join(', ')}${tail}` };
}

export function makeItem(exId, target, alt = null) {
  const ex = store.data.exercises[exId];
  const hist = exHistory(exId);
  const last = hist[0];
  const c = coach(target, ex, last, hist[1]);
  let wt = 0, goal = c.goal;
  if (store.settings.coach) wt = c.w ?? 0;
  else if (last) {
    wt = Math.max(...last.sets.map((s) => s.w || 0));
    goal = Array.from({ length: target.sets }, (_, i) => last.sets[i]?.r ?? target.repMin);
  }
  return {
    key: uid(),
    exId,
    target: { ...target },
    alt,
    coach: c,
    best: bestOf(hist),
    sets: Array.from({ length: target.sets }, (_, i) => ({ w: wt, r: goal[i] ?? target.repMin, rir: null, done: false, at: null })),
    skipped: false,
    sel: 0,
  };
}

export function newWorkout(day) {
  return {
    id: uid(),
    dayId: day?.id ?? null,
    dayName: day?.name ?? 'Workout',
    startedAt: Date.now(),
    items: day ? day.items.filter((pi) => store.data.exercises[pi.exId]).map((pi) =>
      makeItem(pi.exId, { sets: pi.sets, setsMin: pi.setsMin ?? pi.sets, repMin: pi.repMin, repMax: pi.repMax }, pi.alt)) : [],
    page: 0,
    rest: null,
    notes: '',
  };
}

// Which day is up: rotation through the program, rest days absorbed by calendar days.
export function today(now = Date.now()) {
  const { program, sessions } = store.data;
  const days = program.days;
  const firstWork = days.findIndex((d) => !d.rest);
  if (firstWork < 0) return { status: 'empty' };
  const todays = sessions.filter((s) => daysBetween(s.startedAt, now) === 0);
  let last = null;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (days.some((d) => d.id === sessions[i].dayId)) { last = sessions[i]; break; }
  }
  if (!last) return { status: 'train', day: days[firstWork], index: firstWork, todays };
  const k = days.findIndex((d) => d.id === last.dayId);
  let j = k, rests = 0;
  for (let n = 0; n < days.length; n++) {
    j = (j + 1) % days.length;
    if (days[j].rest) rests++;
    else break;
  }
  const since = daysBetween(last.startedAt, now);
  const base = { next: days[j], index: j, last, todays };
  if (todays.length) return { ...base, status: 'done', nextIn: Math.max(1, rests + 1) };
  if (since <= rests) return { ...base, status: 'rest', nextIn: rests + 1 - since };
  return { ...base, status: 'train', day: days[j] };
}

export function sessionStats(s) {
  let sets = 0, volume = 0, reps = 0;
  for (const it of s.items) for (const x of it.sets) {
    if (!x.done) continue;
    sets++;
    reps += x.r || 0;
    volume += (x.w || 0) * (x.r || 0);
  }
  return { sets, volume, reps, duration: (s.endedAt || Date.now()) - s.startedAt };
}

// Records set in a session compared with everything logged before it.
// `item`/`set` index the record-setting set, so only that row gets the badge.
export function sessionPRs(s) {
  const prs = [];
  s.items.forEach((it, item) => {
    if (!doneSets(it).length) return;
    const before = exHistory(it.exId, s.id).filter((h) => h.session.startedAt < s.startedAt);
    if (!before.length) return;
    const prev = bestOf(before);
    let bestE = null, bestW = null;
    it.sets.forEach((x, set) => {
      if (!x.done) return;
      const e = e1rm(x.w, x.r);
      if (e > prev.e1rm + 1e-6 && (!bestE || e > bestE.value)) bestE = { value: e, w: x.w, r: x.r, item, set };
      if (x.r > 0 && (x.w || 0) > prev.heavy + 1e-6 && (!bestW || x.w > bestW.w)) bestW = { w: x.w, r: x.r, item, set };
    });
    if (bestE) prs.push({ exId: it.exId, kind: 'e1rm', ...bestE });
    else if (bestW) prs.push({ exId: it.exId, kind: 'weight', value: bestW.w, ...bestW });
  });
  return prs;
}

export function records(exId) {
  const hist = exHistory(exId);
  let e = null, heavy = null, vol = null, reps = null;
  for (const h of hist) {
    let v = 0;
    for (const s of h.sets) {
      const x = e1rm(s.w, s.r);
      if (!e || x > e.value) e = { value: x, w: s.w, r: s.r, t: h.session.startedAt };
      if (s.r > 0 && (!heavy || s.w > heavy.w || (s.w === heavy.w && s.r > heavy.r))) heavy = { w: s.w, r: s.r, t: h.session.startedAt };
      if (!reps || s.r > reps.r) reps = { w: s.w, r: s.r, t: h.session.startedAt };
      v += (s.w || 0) * (s.r || 0);
    }
    if (!vol || v > vol.value) vol = { value: v, t: h.session.startedAt };
  }
  return { e1rm: e, heavy, volume: vol, reps, count: hist.length };
}

// One point per session: est. 1RM, top set weight, volume, best reps.
export function series(exId) {
  return exHistory(exId).reverse().map((h) => {
    let e = 0, top = 0, v = 0, r = 0;
    for (const s of h.sets) {
      e = Math.max(e, e1rm(s.w, s.r));
      top = Math.max(top, s.w || 0);
      r = Math.max(r, s.r || 0);
      v += (s.w || 0) * (s.r || 0);
    }
    return { t: h.session.startedAt, e1rm: e, top, volume: v, reps: r, sets: h.sets };
  });
}

export function weekStart(ts, ws = store.settings.weekStart) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() - ws + 7) % 7));
  return d.getTime();
}

export function volumeByMuscle(from, to) {
  const res = {};
  const ex = store.data.exercises;
  for (const s of store.data.sessions) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const it of s.items) {
      const e = ex[it.exId];
      const n = doneSets(it).length;
      if (!e || !n) continue;
      e.primary.forEach((m) => (res[m] = (res[m] || 0) + n));
      e.secondary.forEach((m) => (res[m] = (res[m] || 0) + n / 2));
    }
  }
  return res;
}

export function sessionsBetween(from, to) {
  return store.data.sessions.filter((s) => s.startedAt >= from && s.startedAt < to);
}

export function streak(now = Date.now()) {
  const weeks = new Set(store.data.sessions.map((s) => weekStart(s.startedAt)));
  let wk = weekStart(now), n = 0;
  if (!weeks.has(wk)) wk = weekStart(addDays(wk, -7));
  while (weeks.has(wk)) {
    n++;
    wk = weekStart(addDays(wk, -7));
  }
  return n;
}

export const workDays = () => store.data.program.days.filter((d) => !d.rest).length;

export function estMinutes(day) {
  let sec = 0;
  for (const it of day.items) {
    const ex = store.data.exercises[it.exId];
    sec += it.sets * (45 + (ex?.rest ?? store.settings.restDefault));
  }
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

// Body weight with an exponentially smoothed trend line.
export function bodySeries() {
  const list = [...store.data.bodyweight].sort((a, b) => a.date.localeCompare(b.date));
  let trend = null;
  return list.map((e) => {
    trend = trend == null ? e.kg : trend + 0.25 * (e.kg - trend);
    return { ...e, trend };
  });
}
