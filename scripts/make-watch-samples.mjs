// Makes the synthetic watch data for the three sample people (web/samples/*-watch.json): 28 days each, from a fixed
// seed, so the files are the same on every run. Made-up people, made-up numbers: Ada sleeps short but improving, Bo
// is steady and active, Cyd's watch was off some days and her numbers drift the other way.
//   node scripts/make-watch-samples.mjs
import { writeFileSync } from 'node:fs';

// A small seeded generator (mulberry32), then a normal-ish draw from it.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r) => (r() + r() + r() + r() - 2) * 1.2;

const PEOPLE = {
  ada: { seed: 11, sleep: [6.2, 6.8, 0.45], rhr: [61, 58, 1.6], hrv: [40, 47, 5], steps: [6300, 6700, 1700], off: [] },
  bo: { seed: 22, sleep: [7.6, 7.6, 0.4], rhr: [53, 53, 1.4], hrv: [72, 72, 7], steps: [11200, 11000, 2400], off: [] },
  cyd: { seed: 33, sleep: [7.0, 6.3, 0.5], rhr: [66, 69, 1.8], hrv: [31, 26, 4], steps: [4800, 4300, 1400], off: [3, 9, 10, 17, 24], noHrv: [5, 12, 13, 20] },
};

const start = Date.UTC(2026, 9, 12); // 12 Oct 2026, so the 28 days end on 8 Nov 2026
for (const [name, p] of Object.entries(PEOPLE)) {
  const r = rng(p.seed);
  const days = [];
  for (let i = 0; i < 28; i++) {
    const date = new Date(start + i * 86400e3).toISOString().slice(0, 10);
    if (p.off.includes(i)) { days.push({ date, sleep_hours: null, resting_hr: null, hrv_ms: null, steps: null }); continue; }
    const at = (spec) => spec[0] + (spec[1] - spec[0]) * (i / 27) + normal(r) * spec[2];
    days.push({
      date,
      sleep_hours: Number(Math.min(10, Math.max(3.5, at(p.sleep))).toFixed(2)),
      resting_hr: Math.round(at(p.rhr)),
      hrv_ms: p.noHrv?.includes(i) ? null : Math.max(8, Math.round(at(p.hrv))),
      steps: Math.max(300, Math.round(at(p.steps) / 10) * 10),
    });
  }
  writeFileSync(new URL(`../web/samples/${name}-watch.json`, import.meta.url), `${JSON.stringify(days, null, 1)}\n`);
  console.log(`${name}-watch.json: ${days.length} days`);
}
