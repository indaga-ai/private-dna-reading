// The watch data (src/health/watch.mjs): what a watch export becomes before it leaves the page, and the message the
// model receives. Every number and note here is worked out on the page, so a wrong one is the page's, not the AI's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWatch, summarizeWatch, togetherNotes, NOT_MEASURED, WATCH_SAMPLES } from '../src/health/watch.mjs';
import { userMessage, MAX_USER_BYTES } from '../src/ai/prompt.mjs';
import { extractPanel } from '../src/genome/parse.mjs';
import { PANEL_RSIDS, callPanel, SAMPLES } from '../src/genome/panel.mjs';
import { strayTopics } from '../src/ai/check-reply.mjs';

const sample = (file) => readFileSync(new URL(`../web/samples/${file}`, import.meta.url), 'utf8');
const days = (n, f) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10), ...f(i) }));
async function traitsOf(file) {
  const text = sample(file);
  return callPanel((await extractPanel((async function* () { yield text; })(), PANEL_RSIDS)).found);
}

test('a watch export is read as JSON or CSV: out-of-range values are dropped, never clamped; the last 28 days kept', () => {
  const rows = days(30, (i) => ({ sleep_hours: 7, resting_hr: i === 29 ? 400 : 60, hrv_ms: 50, steps: 8000 }));
  const json = parseWatch(JSON.stringify(rows));
  assert.equal(json.length, 28);
  assert.equal(json[0].date, rows[2].date, 'the oldest two of 30 days fall out');
  assert.equal(json.at(-1).resting_hr, null, 'a resting heart rate of 400 is not read as 200');
  const csv = parseWatch(['date,sleep_hours,resting_hr,hrv_ms,steps,extra', '2026-10-01,6.5,58,,9000,x', '2026-10-01,7.5,57,44,9100,y', 'nonsense'].join('\n'));
  assert.deepEqual(csv, [{ date: '2026-10-01', sleep_hours: 7.5, resting_hr: 57, hrv_ms: 44, steps: 9100 }], 'a date given twice keeps its last row');
  assert.throws(() => parseWatch('steps\n100'), /date column/);
  assert.throws(() => parseWatch('{"date":"2026-10-01"}'), /date column/);
});

test('the three samples: weekly averages, the change over four weeks, and the fixed notes', () => {
  const summary = (name) => Object.fromEntries(summarizeWatch(parseWatch(sample(WATCH_SAMPLES[name]))).map((m) => [m.id, m]));
  const ada = summary('Ada'), bo = summary('Bo'), cyd = summary('Cyd');
  assert.match(ada.sleep.note, /^Below the 7 or more hours a night recommended for adults \(AASM and SRS, 2015\)\./);
  assert.match(bo.sleep.note, /^Within the 7 or more hours/);
  assert.equal(ada.rhr.change, -3);
  assert.match(ada.rhr.note, /fell by 3 beats a minute\.$/);
  assert.equal(ada.hrv.change, 0, 'within 8% of its first week, HRV held steady');
  assert.equal(cyd.hrv.weeks[1], null, 'a week with fewer than 4 days of a measure has no average');
  assert.match(cyd.steps.note, /fell by 1,375 steps a day\.$/);
  for (const m of [...Object.values(ada), ...Object.values(bo), ...Object.values(cyd)]) assert.deepEqual(strayTopics(m.note), [], m.note);
});

test('too few days: "not measured", never a guess', () => {
  const short = summarizeWatch(parseWatch(JSON.stringify(days(20, () => ({ sleep_hours: 7, resting_hr: 60, hrv_ms: 50, steps: 8000 })))));
  assert.ok(short.every((m) => m.average === null && m.note === NOT_MEASURED), 'fewer than 28 days');
  const sparse = summarizeWatch(parseWatch(JSON.stringify(days(28, (i) => ({ sleep_hours: 7, resting_hr: 60, hrv_ms: i % 3 ? null : 50, steps: 8000 })))));
  const hrv = sparse.find((m) => m.id === 'hrv');
  assert.deepEqual([hrv.average, hrv.note], [null, NOT_MEASURED], 'HRV on 10 of 28 days');
  assert.notEqual(sparse.find((m) => m.id === 'steps').average, null);
});

test('DNA and watch together: only the fixed link, and only when both sides were read', async () => {
  const traits = await traitsOf('ada-23andme.txt');
  const watch = summarizeWatch(parseWatch(sample('ada-watch.json')));
  const [link, ...more] = togetherNotes(traits, watch);
  assert.equal(more.length, 0);
  assert.equal(link.link, 'Muscle fibre protein and steps');
  assert.match(link.note, /does not set how active to be or predict how you respond to training/);
  assert.deepEqual(togetherNotes(traits.map((t) => (t.id === 'muscle' ? { ...t, genotype: null } : t)), watch), [], 'ACTN3 not measured');
  assert.deepEqual(togetherNotes(traits, null), [], 'no watch data');
});

test('the message: unchanged without watch data; with it, every sample stays inside the relay limit', async () => {
  for (const s of SAMPLES) {
    const traits = await traitsOf(s.file);
    const dnaOnly = userMessage(traits);
    assert.ok(dnaOnly.startsWith('Traits:\n') && !dnaOnly.includes('Watch:'), s.name);
    const watch = summarizeWatch(parseWatch(sample(WATCH_SAMPLES[s.name])));
    const full = userMessage(traits, watch, togetherNotes(traits, watch));
    assert.ok(full.startsWith(`${dnaOnly}\nWatch:\n`), `${s.name}: the traits part is the same text`);
    assert.equal(full.split('\n').filter((l) => l.startsWith('{"measure"')).length, 4, s.name);
    assert.ok(new TextEncoder().encode(full).length <= MAX_USER_BYTES, `${s.name}: ${full.length} bytes`);
  }
});
