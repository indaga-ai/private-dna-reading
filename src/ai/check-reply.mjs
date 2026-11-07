// The reading must stay on traits. If the model's text strays into health anyway (the instructions forbid it), the
// page says so next to the reply instead of hiding it; the fixed results in step 2 stay the source of truth.
const STRAY = [
  ['cancer', /\bcancers?\b|\bcarcinoma/i],
  ['disease', /\bdiseases?\b/i],
  ['diagnosis', /\bdiagnos(is|es|ed|e)\b/i],
  ['medicine or drugs', /\bmedications?\b|\bmedicines?\b|\bdrugs?\b|\bprescri/i],
  ['health risk', /\b(health|disease|cancer)[- ]risks?\b|\brisk of (developing|getting)\b/i],
  ['a disorder or syndrome', /\bdisorders?\b|\bsyndromes?\b/i],
  ['treatment', /\btreatments?\b|\btherap(y|ies)\b/i],
  ['diet or drinking advice', /\byou should (avoid|drink|eat|limit|cut)\b|\b(avoid|limit) (alcohol|dairy|milk)\b/i],
];

/** The topics a reply strays into; an empty list means it stayed on traits. */
export function strayTopics(text) {
  return STRAY.filter(([, re]) => re.test(text)).map(([name]) => name);
}
