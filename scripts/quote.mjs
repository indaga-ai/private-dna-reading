// Live prices for a reading in every offered coin, from real NEAR Intents dry quotes. No key, no funds, nothing
// created:  npm run quote   (PRICE_USDC=2.50 npm run quote for another price)
import { Payments } from '../server/payments.mjs';

const price = process.env.PRICE_USDC || '5.00';
const p = new Payments({ mode: 'simulated', priceUsdc: price, recipient: '' });
const coins = await p.coins();
console.log(`A reading costs ${price} USDC, delivered to a NEAR Intents account. Live dry quotes (${new Date().toISOString()}):\n`);
for (const c of coins) {
  const body = p.quoteBody({ assetId: c.assetId, blockchain: c.blockchain, refundTo: 'demo.near', dry: true });
  body.refundType = 'INTENTS';
  const r = await p.oneClick('/v0/quote', { method: 'POST', body: JSON.stringify(body) });
  const q = r.json?.quote;
  const min = /try at least (\d+)/.exec(r.json?.message || '');
  console.log(`  ${c.label.padEnd(16)} ${q ? `${q.amountInFormatted} ${c.symbol}  (~$${Number(q.amountInUsd).toFixed(2)}, ~${q.timeEstimate} s)` : min ? `needs at least ${(Number(min[1]) / 1e6).toFixed(2)} USDC per payment right now` : `no quote (HTTP ${r.status})`}`);
}
