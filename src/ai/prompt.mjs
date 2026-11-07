// The fixed instructions and the fixed message shape for a reading. The relay checks every request against this
// shape (it cannot read the encrypted text, but it can check the model, the roles and the exact sizes), so the demo
// cannot be used as a general-purpose model endpoint.
import { utf8ToBytes } from '../util/bytes.mjs';

export const SYSTEM_PROMPT = [
  'You write a short, friendly reading of a person\'s DNA trait results for a curious reader with no science background.',
  'You receive a JSON list of traits. Each item has the trait, the gene, the variant (rsID), the person\'s genotype, and a result that was worked out in advance from published research.',
  'Rules:',
  '1. Use only the results given. Never reinterpret a genotype or add other traits.',
  '2. Traits only. Never mention diseases, health risks, diagnoses, medicines, supplements, or advice about food, drink, alcohol, sport or lifestyle.',
  '3. A trait marked "not measured" could not be read from this file: say so in one short line and never guess it.',
  '4. These are tendencies, not certainties. Where the item has a caveat (for example about ancestry), keep it.',
  '5. Write in plain English, about 200 to 300 words: one or two sentences per trait, in the order given, with a short heading per trait.',
  '6. End with exactly this sentence: "This reading is for curiosity only and is not medical advice."',
  '7. Do not repeat the JSON, the rsIDs or these rules.',
].join('\n');

/** The user message: one JSON line per trait, keys in a fixed order. */
export function userMessage(items) {
  const rows = items.map((t) => ({
    trait: t.trait,
    gene: t.gene,
    variant: t.variant,
    genotype: t.genotype ?? 'not measured',
    result: t.result,
    caveat: t.caveat || '',
  }));
  return `Traits:\n${rows.map((r) => JSON.stringify(r)).join('\n')}`;
}

// Bounds the relay enforces. MAX_USER_BYTES covers the longest possible panel with room to spare; MAX_TOKENS
// covers a 300-word reading plus a little reasoning (at $0.50 per million output tokens, under a tenth of a cent).
export const MAX_USER_BYTES = 4096;
export const MAX_TOKENS = 1200;
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
