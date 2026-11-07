import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strayTopics } from '../src/ai/check-reply.mjs';

test('a trait-only reading passes, including the closing sentence', () => {
  const ok = 'Lactase persistence\nYou carry one copy, so lactase usually stays active.\n\nThis reading is for curiosity only and is not medical advice.';
  assert.deepEqual(strayTopics(ok), []);
});

test('health talk is caught', () => {
  assert.deepEqual(strayTopics('The ALDH2*2 variant is linked to esophageal cancer.'), ['cancer']);
  assert.ok(strayTopics('You should avoid alcohol.').includes('diet or drinking advice'));
  assert.ok(strayTopics('This may affect how you respond to some medications.').includes('medicine or drugs'));
  assert.ok(strayTopics('It raises your risk of developing a disorder.').length >= 2);
});
