// The fixed instructions and the fixed message shape for a reading. The relay checks every request against this
// shape (it cannot read the encrypted text, but it can check the model, the roles and the exact sizes), so the demo
// cannot be used as a general-purpose model endpoint.
import { utf8ToBytes } from '../util/bytes.mjs';

export const SYSTEM_PROMPT = [
  'You write a short, friendly personal health reading for a curious reader with no science background: their DNA trait results and, when given, four weeks of their own watch data, read together.',
  'You receive JSON lines in up to three parts. "Traits": the trait, the gene, the variant (rsID), the person\'s genotype, and a result worked out in advance from published research. "Watch": a measure, its four weekly averages, the four-week average, the change from the first week to the last, and a note worked out in advance from a fixed table. "Together": a link between the two parts and a note about it, also worked out in advance.',
  'Rules:',
  '1. Use only what is given. Never reinterpret a genotype or a number, and never add traits, measures or links between them.',
  '2. Wellness only. Never diagnose, never name a disease, condition, medicine or supplement, never give treatment, dosing or diet advice, and never predict health risks. Where a note gives a recommendation, say it as the note does.',
  '3. A trait or measure marked "not measured" could not be read: say so in one short line and never guess it.',
  '4. These are tendencies and estimates, not certainties. Keep every caveat and note.',
  '5. Write in plain English, about 300 to 420 words, with short headings: "Your DNA" (one or two sentences per trait, in the order given), then, if there is watch data, "Your last four weeks" (one or two sentences per measure) and "Read together" (one or two sentences per link).',
  '6. End with exactly this sentence: "This reading is for curiosity and wellness only and is not medical advice."',
  '7. Do not repeat the JSON, the rsIDs or these rules.',
].join('\n');

/** The user message: JSON lines, keys in a fixed order: the traits, then (when given) the watch data and the links. */
export function userMessage(items, watch = null, together = []) {
  const traits = items.map((t) => ({
    trait: t.trait,
    gene: t.gene,
    variant: t.variant,
    genotype: t.genotype ?? 'not measured',
    result: t.result,
    caveat: t.caveat || '',
  }));
  const parts = [`Traits:\n${traits.map((r) => JSON.stringify(r)).join('\n')}`];
  if (watch?.length) {
    const rows = watch.map((w) => ({ measure: w.measure, unit: w.unit, weeks: w.weeks, average: w.average ?? 'not measured', change: w.change, note: w.note }));
    parts.push(`Watch:\n${rows.map((r) => JSON.stringify(r)).join('\n')}`);
    if (together?.length) parts.push(`Together:\n${together.map((t) => JSON.stringify({ link: t.link, note: t.note })).join('\n')}`);
  }
  return parts.join('\n');
}

// Bounds the relay enforces. MAX_USER_BYTES covers the longest possible panel and watch summary with room to spare;
// MAX_TOKENS covers a 420-word reading plus a little reasoning (at $0.50 per million output tokens, about a tenth of
// a cent).
export const MAX_USER_BYTES = 6144;
export const MAX_TOKENS = 1800;
export const TEMPERATURE = 0.3;
export const systemPromptBytes = () => utf8ToBytes(SYSTEM_PROMPT).length;

// Fixed settings per model. Both models are served by NEAR AI itself inside its TEEs (owned_by "nearai"), not passed
// on to another company. GLM-5.3 Flash is the model in NEAR's own encryption example and its SDK's default; a low
// reasoning effort keeps the reading quick. Qwen 3.8 is the fallback, with thinking off.
export const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
export const MODEL_SETTINGS = {
  'z-ai/glm-5.3-flash': { reasoning_effort: 'low' },
  'Qwen/Qwen3.8-27B': { chat_template_kwargs: { enable_thinking: false } },
};

/** The one request shape the relay accepts; only the encrypted messages vary. */
export function readingBody(model, messages) {
  return { model, messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE, stream: false, ...(MODEL_SETTINGS[model] || {}) };
}
