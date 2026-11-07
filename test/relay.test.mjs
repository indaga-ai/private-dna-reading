// The relay: the fixed request shape, rate limits, the key staying server-side, and a whole encrypted exchange
// through the stand-in model (same protocol as NEAR AI Cloud, minus the hardware).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHandler, checkReadingShape } from '../server/handler.mjs';
import { StandIn } from '../server/stand-in.mjs';
import { RateLimiter } from '../server/ratelimit.mjs';
import { SYSTEM_PROMPT, userMessage, MAX_USER_BYTES, readingBody, DEFAULT_MODEL } from '../src/ai/prompt.mjs';
import { newClientKeys, encryptMessages, encryptTo, decryptWith, requestFieldAad, e2eeHeaders } from '../src/tee/e2ee.mjs';
import { verifyReplySignature } from '../src/tee/signature.mjs';

const MODEL = DEFAULT_MODEL;
const CLIENT = newClientKeys();
const items = [{ trait: 'Earwax type', gene: 'ABCC11', variant: 'rs17822931', genotype: 'CT', result: 'Wet earwax is likely.', caveat: '' }];
const body = (key, over = {}, client = CLIENT.publicKey) => ({
  ...readingBody(MODEL, encryptMessages(key, client, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(items) }])),
  ...over,
});
const enc = (key, text) => encryptTo(key, text, requestFieldAad(CLIENT.publicKey));

test('the fixed shape passes', () => {
  assert.doesNotThrow(() => checkReadingShape(body(newClientKeys().publicKey), { model: MODEL }));
});

test('anything else is refused', () => {
  const k = newClientKeys().publicKey;
  const bad = {
    'an extra field': body(k, { tools: [] }),
    'another model': body(k, { model: 'openai/gpt-5' }),
    'more tokens': body(k, { max_tokens: 4000 }),
    'streaming': body(k, { stream: true }),
    'a third message': { ...body(k), messages: [...body(k).messages, { role: 'user', content: enc(k, 'hi') }] },
    'another reasoning setting': body(k, { reasoning_effort: 'high' }),
    'a missing model setting': (() => { const b = body(k); delete b.reasoning_effort; return b; })(),
    'plain text': { ...body(k), messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: 'hello' }] },
    'other instructions': { ...body(k), messages: [{ role: 'system', content: enc(k, 'You are a helpful assistant.') }, body(k).messages[1]] },
    'an oversized question': { ...body(k), messages: [body(k).messages[0], { role: 'user', content: enc(k, 'x'.repeat(MAX_USER_BYTES + 1)) }] },
    'roles swapped': { ...body(k), messages: [...body(k).messages].reverse() },
  };
  for (const [name, b] of Object.entries(bad)) {
    assert.throws(() => checkReadingShape(b, { model: MODEL }), (e) => e.status === 400, name);
  }
});

test('rate limits: per address per hour, per day, and for the whole server', () => {
  let t = 0;
  const rl = new RateLimiter({ perHour: 2, perDay: 3, globalPerDay: 4 }, () => t);
  rl.take('a');
  rl.take('a');
  assert.throws(() => rl.take('a'), (e) => e.code === 'limit_hour');
  t += 3_600_001;
  rl.take('a');
  assert.throws(() => rl.take('a'), (e) => e.code === 'limit_day');
  rl.take('b');
  assert.throws(() => rl.take('c'), (e) => e.code === 'busy_today');
});

let server;
let base;
const standIn = new StandIn(MODEL);
const KEY = 'test-key-0000-must-never-leave-the-server';
before(async () => {
  // apiKey is set only to prove it never appears in a response; the stand-in answers because `live` is forced off.
  const handler = createHandler({ model: MODEL, standIn, apiKey: '', fetch: async () => { throw new Error('no network in tests'); } });
  server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('a whole exchange: encrypted request, encrypted reply, valid signature over both', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  assert.equal(cfg.inference, 'stand-in');
  assert.equal(cfg.standInKey, standIn.publicKey);
  const client = newClientKeys();
  const reqBytes = new TextEncoder().encode(JSON.stringify(body(cfg.standInKey, {}, client.publicKey)));
  const r = await fetch(`${base}/api/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...e2eeHeaders(client.publicKey, cfg.standInKey) },
    body: reqBytes,
  });
  assert.equal(r.status, 200);
  const respBytes = new Uint8Array(await r.arrayBuffer());
  const reply = JSON.parse(new TextDecoder().decode(respBytes));
  const text = decryptWith(client.secretKey, reply.choices[0].message.content);
  assert.match(text, /Earwax type/);
  assert.match(text, /not medical advice/);
  const sig = await (await fetch(`${base}/api/signature/${reply.id}`)).json();
  const v = verifyReplySignature({ sig, model: MODEL, requestBytes: reqBytes, responseBytes: respBytes, key: { algo: 'ed25519', publicKey: cfg.standInKey, address: cfg.standInKey } });
  assert.equal(v.ok, true);
  // The same signature does not cover a changed reply.
  const changed = respBytes.slice();
  changed[changed.length - 5] ^= 1;
  assert.equal(verifyReplySignature({ sig, model: MODEL, requestBytes: reqBytes, responseBytes: changed, key: { algo: 'ed25519', publicKey: cfg.standInKey, address: cfg.standInKey } }).ok, false);
});

test('v3: a request whose reply key was swapped on the way is refused by the model', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  const browser = newClientKeys();
  const relay = newClientKeys();
  const r = await fetch(`${base}/api/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...e2eeHeaders(relay.publicKey, cfg.standInKey) },
    body: JSON.stringify(body(cfg.standInKey, {}, browser.publicKey)),
  });
  assert.equal(r.status, 400);
});

test('a request encrypted to another key is refused by the model', async () => {
  const cfg = await (await fetch(`${base}/api/config`)).json();
  const other = newClientKeys().publicKey;
  const r = await fetch(`${base}/api/reading`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-pub-key': newClientKeys().publicKey, 'x-model-pub-key': other },
    body: JSON.stringify(body(other)),
  });
  assert.equal(r.status, 400);
  assert.ok(cfg.standInKey !== other);
});

test('the API key never reaches the browser', async () => {
  const handler = createHandler({ model: MODEL, standIn, apiKey: KEY, fetch: async () => new Response('{}', { status: 200 }) });
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const text = await (await fetch(`${b}/api/config`)).text();
  s.close();
  assert.ok(!text.includes(KEY));
  assert.ok(!text.includes('test-key'));
});

test('static files: the page is served, and paths outside web/ are refused', async () => {
  const { fileURLToPath } = await import('node:url');
  const handler = createHandler({ model: MODEL, standIn, staticRoot: fileURLToPath(new URL('../web/', import.meta.url)) });
  const s = createServer(handler);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const page = await fetch(`${b}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /connect-src 'self' https:\/\/nras\.attestation\.nvidia\.com;/);
  for (const p of ['/..%2Fpackage.json', '/%2e%2e/package.json', '/samples/..%2F..%2Fpackage.json']) {
    const r = await fetch(`${b}${p}`);
    assert.ok([403, 404].includes(r.status), `${p} gave ${r.status}`);
  }
  s.close();
});

test('hosted relay: the rewritten URL is restored to the path the browser asked for', async () => {
  const { originalUrl } = await import('../api/relay.mjs');
  assert.equal(originalUrl('/api/relay?__path=config'), '/api/config');
  assert.equal(originalUrl('/api/relay?__path=attestation&nonce=ab'), '/api/attestation?nonce=ab');
  assert.equal(originalUrl('/api/relay?nonce=ab&__path=pccs%2Ftdx%2Fcertification%2Fv4%2Ftcb'), '/api/pccs/tdx/certification/v4/tcb?nonce=ab');
  assert.equal(originalUrl('/api/config'), '/api/config');
});

test('stand-in on serverless: the same seed gives the same key, and another instance can re-sign the hashes', () => {
  const seed = new Uint8Array(32).fill(7);
  const a = new StandIn(MODEL, seed);
  const b = new StandIn(MODEL, seed);
  assert.equal(a.publicKey, b.publicKey);
  const id = 'chatcmpl-standin-0123456789abcdef01234567';
  const hashes = `${'a'.repeat(64)}:${'b'.repeat(64)}`;
  const r = b.signature(id, hashes);
  assert.equal(r.status, 200);
  const sig = JSON.parse(r.bytes.toString());
  assert.equal(sig.text, `${MODEL}:${hashes}`);
  assert.equal(b.signature(id, 'not-hashes').status, 404);
  assert.equal(b.signature('chatcmpl-real-id', hashes).status, 404, 'only stand-in ids');
});
