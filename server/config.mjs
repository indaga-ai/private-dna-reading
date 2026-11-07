import { DEFAULT_MODEL } from '../src/ai/prompt.mjs';

// Settings from the environment. The API key is read here and passed only to the relay; it is never sent to
// the browser (the bundle is checked for it before a deploy: scripts/check-bundle.mjs).
export function configFromEnv(env) {
  const payments = env.PAYMENTS || 'off';
  if (!['off', 'simulated', 'live'].includes(payments)) throw new Error('PAYMENTS must be off, simulated or live');
  if (payments === 'live' && !env.RECIPIENT) throw new Error('PAYMENTS=live needs RECIPIENT (the NEAR Intents account that receives USDC)');
  return {
    apiKey: env.NEARAI_API_KEY || '',
    base: env.NEARAI_BASE || 'https://cloud-api.near.ai/v1',
    model: env.MODEL || DEFAULT_MODEL,
    hosted: env.HOSTED === '1',
    payments,
    priceUsdc: env.PRICE_USDC || '5.00',
    recipient: env.RECIPIENT || '',
  };
}
