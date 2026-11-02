// Starting data: the exercise library and the 7-day split.

export const MUSCLES = {
  chest: 'Chest',
  lats: 'Lats',
  upperBack: 'Upper back',
  frontDelts: 'Front delts',
  sideDelts: 'Side delts',
  rearDelts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  lowerBack: 'Lower back',
};

const ex = (id, name, primary, secondary = [], o = {}) => ({
  id,
  name,
  primary,
  secondary,
  bodyweight: !!o.bw,
  rest: o.rest ?? 120,
  inc: o.inc ?? null, // { v, u } custom step; null = unit default
  notes: '',
});

export function seedExercises() {
  const list = [
    ex('incline-chest-press', 'Incline Chest Press', ['chest'], ['frontDelts', 'triceps'], { rest: 180 }),
    ex('chest-press', 'Chest Press', ['chest'], ['triceps', 'frontDelts'], { rest: 150 }),
    ex('pec-fly', 'Pec Fly', ['chest'], [], { rest: 90 }),
    ex('shoulder-press', 'Shoulder Press', ['frontDelts'], ['sideDelts', 'triceps'], { rest: 150 }),
    ex('cable-lateral-raise', 'Cable Lateral Raise', ['sideDelts'], [], { rest: 75 }),
    ex('sa-cable-triceps-ext', 'Single-Arm Cable Triceps Extension', ['triceps'], [], { rest: 75 }),
    ex('oh-cable-triceps-ext', 'Overhead Cable Triceps Extension', ['triceps'], [], { rest: 90 }),
    ex('cable-crunch', 'Cable Crunch', ['abs'], [], { rest: 75 }),
    ex('lat-pulldown', 'Lat Pulldown / Vertical Traction', ['lats'], ['biceps', 'upperBack'], { rest: 150 }),
    ex('cs-row', 'Chest-Supported Row', ['upperBack'], ['lats', 'rearDelts', 'biceps'], { rest: 150 }),
    ex('sa-cable-lat-row', 'Single-Arm Cable Lat Row', ['lats'], ['biceps'], { rest: 120 }),
    ex('reverse-pec-deck', 'Reverse Pec Deck', ['rearDelts'], ['upperBack'], { rest: 75 }),
    ex('preacher-curl', 'Preacher Curl', ['biceps'], [], { rest: 120 }),
    ex('hammer-curl', 'Hammer Curl', ['biceps'], ['forearms'], { rest: 90 }),
    ex('leg-extension', 'Leg Extension', ['quads'], [], { rest: 120 }),
    ex('leg-press', 'Leg Press', ['quads'], ['glutes', 'adductors'], { rest: 180, inc: { v: 5, u: 'kg' } }),
    ex('leg-curl', 'Leg Curl', ['hamstrings'], [], { rest: 120 }),
    ex('romanian-deadlift', 'Romanian Deadlift', ['hamstrings'], ['glutes', 'lowerBack'], { rest: 180 }),
    ex('calf-press', 'Calf Press', ['calves'], [], { rest: 90 }),
    ex('hip-adductor', 'Hip Adductor', ['adductors'], [], { rest: 90 }),
    ex('hanging-leg-raise', 'Hanging Leg Raise / Captain’s Chair', ['abs'], [], { rest: 90, bw: true }),
  ];
  return Object.fromEntries(list.map((e) => [e.id, e]));
}

let n = 0;
const it = (exId, sets, repMin, repMax, o = {}) => ({
  id: 'i' + (++n).toString(36) + Math.random().toString(36).slice(2, 6),
  exId,
  sets,
  setsMin: o.min ?? sets,
  repMin,
  repMax,
  alt: o.alt ?? null,
});

export function seedProgram() {
  return {
    id: 'main',
    name: 'Push · Pull · Legs · Upper · Lower',
    days: [
      {
        id: 'd-push', name: 'Push', rest: false, items: [
          it('incline-chest-press', 2, 5, 9),
          it('chest-press', 2, 6, 10),
          it('pec-fly', 2, 8, 12),
          it('shoulder-press', 2, 6, 10),
          it('cable-lateral-raise', 2, 10, 15),
          it('sa-cable-triceps-ext', 2, 8, 12),
          it('oh-cable-triceps-ext', 2, 8, 12),
          it('cable-crunch', 2, 10, 15),
        ],
      },
      {
        id: 'd-pull', name: 'Pull', rest: false, items: [
          it('lat-pulldown', 2, 6, 10),
          it('cs-row', 2, 6, 10),
          it('sa-cable-lat-row', 2, 8, 12),
          it('reverse-pec-deck', 2, 10, 15),
          it('preacher-curl', 2, 6, 10),
          it('hammer-curl', 2, 8, 12),
        ],
      },
      {
        id: 'd-legs', name: 'Legs', rest: false, items: [
          it('leg-extension', 2, 8, 12),
          it('leg-press', 2, 6, 10),
          it('leg-curl', 2, 8, 12),
          it('romanian-deadlift', 2, 6, 10),
          it('calf-press', 2, 8, 15),
          it('hip-adductor', 2, 10, 15),
        ],
      },
      { id: 'd-rest-1', name: 'Rest', rest: true, items: [] },
      {
        id: 'd-upper', name: 'Upper', rest: false, items: [
          it('incline-chest-press', 2, 5, 9),
          it('lat-pulldown', 2, 6, 10),
          it('cs-row', 2, 6, 10),
          it('pec-fly', 2, 8, 12, { min: 1, alt: 'chest-press' }),
          it('cable-lateral-raise', 3, 10, 15),
          it('reverse-pec-deck', 2, 10, 15),
          it('sa-cable-triceps-ext', 2, 8, 12),
          it('preacher-curl', 2, 6, 10),
          it('hammer-curl', 1, 8, 12),
          it('cable-crunch', 2, 10, 15),
        ],
      },
      {
        id: 'd-lower', name: 'Lower', rest: false, items: [
          it('leg-curl', 2, 8, 12),
          it('romanian-deadlift', 2, 6, 10),
          it('leg-extension', 2, 8, 12),
          it('leg-press', 2, 6, 10),
          it('calf-press', 2, 10, 15),
          it('hip-adductor', 2, 10, 15, { min: 1 }),
          it('hanging-leg-raise', 2, 8, 15),
        ],
      },
      { id: 'd-rest-2', name: 'Rest', rest: true, items: [] },
    ],
  };
}
