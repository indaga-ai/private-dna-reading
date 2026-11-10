// Four weeks of a watch's daily numbers, reduced on this page to what leaves it: four weekly averages per measure,
// the change over the four weeks, and a note from a small fixed table (docs/WATCH.md, with its sources). Like the
// DNA results, every number and note is worked out here; the AI only writes them up. Wellness only: no threshold
// that would amount to a diagnosis, and none at all for HRV and resting heart rate, which differ by person and device.

// The measures read, the column each comes from, the plausible range a row must fall in, how to round it, and how
// small a change over the four weeks counts as steady (HRV: a share of its first week, its scale differs so much).
export const MEASURES = [
  { id: 'sleep', measure: 'Sleep', unit: 'hours a night', key: 'sleep_hours', min: 0, max: 16, digits: 1, steady: 0.25, changeUnit: 'hours' },
  { id: 'rhr', measure: 'Resting heart rate', unit: 'beats a minute', key: 'resting_hr', min: 25, max: 200, digits: 0, steady: 2, changeUnit: 'beats a minute' },
  { id: 'hrv', measure: 'Heart rate variability (as the watch reports it)', unit: 'ms', key: 'hrv_ms', min: 1, max: 300, digits: 0, steadyShare: 0.08, changeUnit: 'ms' },
  { id: 'steps', measure: 'Steps', unit: 'a day', key: 'steps', min: 0, max: 100000, digits: 0, steady: 500, changeUnit: 'steps a day' },
];

export const DAYS = 28;
export const NOT_MEASURED = 'Not measured: the watch data has too few days of this to say anything.';

// A watch export as rows of { date, sleep_hours, resting_hr, hrv_ms, steps }: a JSON array, or CSV with that header.
// Unknown columns are ignored; a value outside its plausible range is dropped (read as missing), never clamped.
export function parseWatch(text) {
  const t = String(text ?? '').trim();
  let raw;
  if (t.startsWith('[')) {
    raw = JSON.parse(t);
    if (!Array.isArray(raw)) throw new Error('watch data must be a list of days');
  } else {
    const [head, ...lines] = t.split(/\r?\n/).filter((l) => l.trim());
    const cols = (head || '').split(',').map((c) => c.trim().toLowerCase());
    if (!cols.includes('date')) throw new Error('watch data needs a date column');
    raw = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
  }
  const days = new Map();
  for (const r of raw) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r?.date ?? '')) ? r.date : null;
    if (!date) continue;
    const row = { date };
    for (const m of MEASURES) {
      const given = r[m.key];
      const v = given === '' || given === null || given === undefined ? NaN : Number(given);
      row[m.key] = Number.isFinite(v) && v >= m.min && v <= m.max ? v : null;
    }
    days.set(date, row); // a date given twice keeps its last row
  }
  // The last 28 days of the export, oldest first.
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-DAYS);
}

const round = (v, digits) => Number(v.toFixed(digits));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const words = (n) => n.toLocaleString('en-US');

// The change from the first measured week to the last, and how to say it.
function trend(m, weekly) {
  const measured = weekly.filter((v) => v !== null);
  if (measured.length < 2) return { change: null, text: '' };
  const first = measured[0], last = measured[measured.length - 1];
  const change = round(last - first, m.digits);
  const limit = m.steadyShare ? m.steadyShare * first : m.steady;
  if (Math.abs(change) < limit) return { change: 0, text: 'Over the four weeks it held steady.' };
  return { change, text: `Over the four weeks it ${change > 0 ? 'rose' : 'fell'} by ${words(Math.abs(change))} ${m.changeUnit}.` };
}

// The fixed notes. Each says only what its source says (docs/WATCH.md); none diagnoses or predicts.
const NOTES = {
  sleep: (avg) => (avg < 7 ? 'Below the 7 or more hours a night recommended for adults (AASM and SRS, 2015).'
    : 'Within the 7 or more hours a night recommended for adults (AASM and SRS, 2015).'),
  rhr: () => "A watch's estimate: compare it with your own earlier weeks, not with other people.",
  hrv: () => "A watch's estimate that differs a lot between people and devices: only your own trend tells you much.",
  steps: () => 'Steps are one rough way to see how active you are; the WHO recommends at least 150 minutes of moderate activity a week for adults (2020).',
};

// Per measure: the four weekly averages, the average, the change from the first week to the last, and the note. A
// week needs 4 days with the measure and the four weeks 14 in all, or the measure is "not measured" (never guessed).
export function summarizeWatch(rows) {
  const weeks = [0, 1, 2, 3].map((w) => rows.slice(w * 7, w * 7 + 7));
  return MEASURES.map((m) => {
    const all = rows.map((r) => r[m.key]).filter((v) => v !== null);
    const weekly = weeks.map((d) => {
      const vs = d.map((r) => r[m.key]).filter((v) => v !== null);
      return vs.length >= 4 ? round(mean(vs), m.digits) : null;
    });
    const base = { id: m.id, measure: m.measure, unit: m.unit, weeks: weekly };
    if (rows.length < DAYS || all.length < 14) return { ...base, average: null, change: null, note: NOT_MEASURED };
    const average = round(mean(all), m.digits);
    const t = trend(m, weekly);
    return { ...base, average, change: t.change, note: `${NOTES[m.id](average)} ${t.text}`.trim() };
  });
}

// What the DNA and the watch say together: only links in this fixed table, each one honest about what the gene does
// not decide. Today one: the muscle-fibre gene (ACTN3) and steps.
export function togetherNotes(traits, watch) {
  const notes = [];
  const muscle = traits?.find((t) => t.id === 'muscle' && t.genotype);
  const steps = watch?.find((w) => w.id === 'steps' && w.average !== null);
  if (muscle && steps) {
    notes.push({ link: 'Muscle fibre protein and steps',
      note: `The ACTN3 result is about one muscle protein; it does not set how active to be or predict how you respond to training. Your steps show how active you are now: ${words(steps.average)} a day on average.` });
  }
  return notes;
}

// The synthetic watch data that goes with each sample person (web/samples, made by scripts/make-watch-samples.mjs).
export const WATCH_SAMPLES = { Ada: 'ada-watch.json', Bo: 'bo-watch.json', Cyd: 'cyd-watch.json' };
