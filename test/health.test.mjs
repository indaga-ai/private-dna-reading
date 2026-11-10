// The blood test (src/health/labs.mjs) and the improvement plan (src/health/plan.mjs): both worked out on this page,
// so a value placed on the wrong side of its range, or an action the table does not hold, is the page's error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLabs, summarizeLabs, NOTES, LAB_SAMPLES, MAX_MARKERS } from '../src/health/labs.mjs';
import { improvementPlan } from '../src/health/plan.mjs';
import { parseWatch, summarizeWatch, togetherNotes, WATCH_SAMPLES } from '../src/health/watch.mjs';
import { userMessage, MAX_USER_BYTES } from '../src/ai/prompt.mjs';
import { strayTopics } from '../src/ai/check-reply.mjs';
import { extractPanel } from '../src/genome/parse.mjs';
import { PANEL_RSIDS, callPanel, SAMPLES } from '../src/genome/panel.mjs';

const sample = (file) => readFileSync(new URL(`../web/samples/${file}`, import.meta.url), 'utf8');
const person = (name) => ({ watch: summarizeWatch(parseWatch(sample(WATCH_SAMPLES[name]))), labs: summarizeLabs(parseLabs(sample(LAB_SAMPLES[name]))) });

test("a blood value is placed only against its lab's own range, in the same unit; nothing is converted", () => {
  const rows = parseLabs(['marker,value,unit,low,high,range_unit', 'LDL cholesterol,3.6,mmol/L,,3.0,', 'HDL,0.9,mmol/L,1.0,,', 'Ferritin,95,µg/L,15,300,',
    'Glucose,99,mg/dL,3.9,5.6,mmol/L', 'Vitamin B12,300,pmol/L,,,', 'no value,,mmol/L,1,2,', 'LDL cholesterol,2.9,mmol/L,,3.0,'].join('\n'));
  const by = Object.fromEntries(summarizeLabs(rows).map((r) => [r.marker, r]));
  assert.deepEqual([by['LDL cholesterol'].position, by['LDL cholesterol'].value], ['within', 2.9], 'a marker given twice keeps its last row');
  assert.equal(by.HDL.position, 'below');
  assert.equal(by.Ferritin.range, '15–300 µg/L');
  assert.equal(by.Glucose.position, 'not compared', 'a range printed in another unit is not compared, and not converted');
  assert.equal(by['Vitamin B12'].note, NOTES.none);
  assert.ok(!('no value' in by), 'a row without a value is skipped');
  assert.throws(() => parseLabs(JSON.stringify(Array.from({ length: MAX_MARKERS + 1 }, (_, i) => ({ marker: `m${i}`, value: 1 })))), /at most 12/);
  assert.throws(() => parseLabs('marker,unit\nx,y'), /marker and value/);
  for (const note of Object.values(NOTES)) assert.deepEqual(strayTopics(note), [], note);
});

test('the plan for each sample person: fixed actions, in priority order, at most three', () => {
  const areas = (name) => improvementPlan(person(name)).map((a) => a.area);
  assert.deepEqual(areas('Ada'), ['Blood test', 'Sleep'], "Ada: vitamin D below her lab's range, then 6.4 hours of sleep");
  assert.deepEqual(areas('Bo'), ['Keep going']);
  assert.deepEqual(areas('Cyd'), ['Blood test', 'Sleep', 'Activity'], 'Cyd: all five rules apply (her resting heart rate rose by 4 and her HRV fell by 8 ms); only the first three are kept');
  const [blood] = improvementPlan(person('Cyd'));
  assert.equal(blood.why, 'LDL cholesterol and Triglycerides are above the range your lab printed.');
  assert.match(blood.action, /^Ask a doctor about these results/);
  for (const name of ['Ada', 'Bo', 'Cyd']) {
    for (const a of improvementPlan(person(name))) assert.deepEqual(strayTopics(`${a.why} ${a.action}`), [], `${name}: ${a.action}`);
  }
  assert.deepEqual(improvementPlan({}), [], 'no watch data and no blood test: no plan');
  assert.deepEqual(improvementPlan({ labs: person('Bo').labs }).map((a) => a.area), ['Keep going'], 'a blood test alone can give a plan');
});

test('the stray check reads the reading\'s own disclaimers as such', () => {
  assert.deepEqual(strayTopics('A value outside the range is a question for a doctor, not a diagnosis.'), []);
  assert.deepEqual(strayTopics('No diagnosis is made here.'), []);
  assert.deepEqual(strayTopics('This points to a diagnosis of anaemia.'), ['diagnosis']);
});

test('the whole message stays inside the relay limit, for every sample person and the largest blood test the parser takes', async () => {
  // 12 markers with 60-character names and 20-character units in a 3-byte script, quotes to escape, the longest numbers,
  // and six above and six below their range, so every name is in the plan's first action too.
  const max = Number.MAX_VALUE;
  const largest = summarizeLabs(parseLabs(JSON.stringify(Array.from({ length: MAX_MARKERS }, (_, i) => ({
    marker: `${i}"`.padEnd(60, '漢'), unit: '"'.padEnd(20, '漢'), value: i % 2 ? max : -max, low: i % 2 ? -max : max, high: i % 2 ? -max : max, date: '2026-11-02',
  })))));
  assert.deepEqual(largest.map((l) => l.position), Array.from({ length: MAX_MARKERS }, (_, i) => (i % 2 ? 'above' : 'below')));
  for (const s of SAMPLES) {
    const text = sample(s.file);
    const traits = callPanel((await extractPanel((async function* () { yield text; })(), PANEL_RSIDS)).found);
    const { watch, labs } = person(s.name);
    const msg = userMessage(traits, { watch, labs, together: togetherNotes(traits, watch), plan: improvementPlan({ watch, labs }) });
    assert.deepEqual(msg.split('\n').filter((l) => /^[A-Z][a-z]+:$/.test(l)), ['Traits:', 'Watch:', 'Labs:', 'Together:', 'Plan:'], s.name);
    assert.ok(new TextEncoder().encode(msg).length <= MAX_USER_BYTES, `${s.name}: ${msg.length} bytes`);
    const most = userMessage(traits, { watch, labs: largest, together: togetherNotes(traits, watch), plan: improvementPlan({ watch, labs: largest }) });
    assert.ok(new TextEncoder().encode(most).length <= MAX_USER_BYTES, `${s.name} with the largest blood test: ${new TextEncoder().encode(most).length} bytes`);
  }
});
