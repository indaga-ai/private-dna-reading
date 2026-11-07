// Payments: price units, the quote request shape, reading passes, and the on-chain proof before a pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Payments, usdcUnits, USDC_ON_NEAR } from '../server/payments.mjs';

test('prices become exact USDC base units', () => {
  assert.equal(usdcUnits('5.00'), '5000000');
  assert.equal(usdcUnits('0.5'), '500000');
  assert.equal(usdcUnits('12'), '12000000');
  assert.throws(() => usdcUnits('1.2345678'));
  assert.throws(() => usdcUnits('-1'));
});

test('a quote asks for exactly the price in USDC, delivered inside NEAR Intents, refunds on the buyer\'s chain', () => {
  const p = new Payments({ mode: 'live', priceUsdc: '5.00', recipient: '0xAbCdEf0123456789abcdef0123456789ABCDEF01', now: () => Date.UTC(2026, 10, 7, 12) });
  const b = p.quoteBody({ assetId: 'nep141:sol.omft.near', blockchain: 'sol', refundTo: 'So1anaRefundAddress1111111111111111111111', dry: false });
  assert.equal(b.swapType, 'EXACT_OUTPUT');
  assert.equal(b.amount, '5000000');
  assert.equal(b.destinationAsset, USDC_ON_NEAR);
  assert.equal(b.recipientType, 'INTENTS');
  assert.equal(b.recipient, '0xabcdef0123456789abcdef0123456789abcdef01', 'lower-cased');
  assert.equal(b.refundType, 'ORIGIN_CHAIN');
  assert.equal(b.deadline, '2026-11-07T12:30:00.000Z');
  assert.equal(p.quoteBody({ assetId: 'x', blockchain: 'btc', refundTo: 'bc1q', dry: true }).deadline, '2026-11-07T14:00:00.000Z', 'slow chains get two hours');
});

test('a reading pass works three times, then not; a forged or expired one never', async () => {
  let t = 0;
  const p = new Payments({ mode: 'simulated', priceUsdc: '5.00', recipient: '', now: () => t });
  const pass = p.issuePass('sim-1');
  for (let i = 0; i < 3; i++) await p.redeem(pass);
  await assert.rejects(p.redeem(pass), (e) => e.status === 402);
  const [body] = p.issuePass('sim-2').split('.');
  await assert.rejects(p.redeem(`${body}.AAAA`), (e) => e.status === 402);
  await assert.rejects(p.redeem(''), (e) => e.status === 402);
  const late = p.issuePass('sim-3');
  t += 61 * 60_000;
  await assert.rejects(p.redeem(late), (e) => e.status === 402);
  const other = new Payments({ mode: 'simulated', priceUsdc: '5.00', recipient: '' });
  await assert.rejects(other.redeem(p.issuePass('sim-4')), (e) => e.status === 402, 'another server\'s secret');
});

test('live: SUCCESS from 1Click is not enough; the pass needs the USDC on chain', async () => {
  let balance = 1_000_000n;
  let status = 'PENDING_DEPOSIT';
  const fetchStub = async (url, init) => {
    if (String(url).includes('free.rpc')) {
      const bytes = [...Buffer.from(JSON.stringify(balance.toString()))];
      return new Response(JSON.stringify({ result: { result: bytes } }));
    }
    if (String(url).endsWith('/v0/tokens')) return new Response(JSON.stringify([{ symbol: 'SOL', blockchain: 'sol', assetId: 'nep141:sol.omft.near', decimals: 9, price: 180 }]));
    if (String(url).includes('/v0/quote')) return new Response(JSON.stringify({ quote: { depositAddress: 'DEP1', amountInFormatted: '0.03', amountInUsd: '5.05', amountOutFormatted: '5.0', timeEstimate: 20, deadline: '2026-11-07T12:30:00Z' } }), { status: 201 });
    if (String(url).includes('/v0/status')) return new Response(JSON.stringify({ status }));
    throw new Error(`unexpected ${url} ${init?.method}`);
  };
  const p = new Payments({ mode: 'live', priceUsdc: '5.00', recipient: 'shop.near', fetch: fetchStub });
  const calls = [];
  const res = { };
  const send = (_res, code, body) => calls.push({ code, body });
  const readBody = async () => Buffer.from(JSON.stringify({ assetId: 'nep141:sol.omft.near', refundTo: 'So1anaRefundAddress1111111111111111111111' }));
  const ctx = { send, readBody, ip: '1', lookups: { take() {} } };
  await p.handle({ method: 'POST' }, res, new URL('http://x/api/pay/quote'), ctx);
  assert.equal(calls.at(-1).body.depositAddress, 'DEP1');
  const poll = () => p.handle({ method: 'GET' }, res, new URL('http://x/api/pay/status?depositAddress=DEP1'), ctx);
  status = 'SUCCESS';
  await poll();
  assert.equal(calls.at(-1).body.pass, undefined, 'no USDC arrived yet, so no pass');
  assert.equal(calls.at(-1).body.onChain.enough, false);
  balance += 5_000_000n;
  await poll();
  assert.ok(calls.at(-1).body.pass, 'USDC arrived: pass issued');
  await poll();
  assert.equal(calls.at(-1).body.pass, undefined, 'one deposit, one pass');
});
