// The whole reading from the command line, without a browser, straight to NEAR AI Cloud (no relay):
//   NEARAI_API_KEY=... npm run reading                  the sample "Ada"
//   NEARAI_API_KEY=... npm run reading -- my-file.txt   your own raw DNA file (.txt, .csv or .zip)
// It reads the file here, checks the hardware (Intel and NVIDIA included), encrypts the panel to the attested key,
// decrypts the reply and checks its signature, printing each step.
import { readFileSync, openAsBlob } from 'node:fs';
import { extractPanel, fromString } from '../src/genome/parse.mjs';
import { isZip, openRawDataInZip, chunksOf } from '../src/genome/unzip.mjs';
import { PANEL_RSIDS, callPanel } from '../src/genome/panel.mjs';
import { verifyModelAttestation, newNonce } from '../src/tee/attestation.mjs';
import { quoteVerifier, gpuVerifier } from '../src/tee/hardware.mjs';
import { newClientKeys, encryptMessages, decryptWith, e2eeHeaders } from '../src/tee/e2ee.mjs';
import { verifyReplySignature } from '../src/tee/signature.mjs';
import { SYSTEM_PROMPT, userMessage, readingBody, DEFAULT_MODEL } from '../src/ai/prompt.mjs';

const key = process.env.NEARAI_API_KEY;
if (!key) {
  console.error('Set NEARAI_API_KEY (from cloud.near.ai). Without a key, try `npm run verify-tee` or `npm start`.');
  process.exit(2);
}
const base = process.env.NEARAI_BASE || 'https://cloud-api.near.ai/v1';
const model = process.env.MODEL || DEFAULT_MODEL;
const path = process.argv[2] || new URL('../web/samples/ada-23andme.txt', import.meta.url).pathname;

// 1. Read the file here.
const blob = await openAsBlob(path);
const chunks = (await isZip(blob)) ? chunksOf((await openRawDataInZip(blob)).text) : fromString(readFileSync(path, 'utf8'));
const parsed = await extractPanel(chunks, PANEL_RSIDS);
const items = callPanel(parsed.found);
console.log(`1. Read ${parsed.rows.toLocaleString()} rows from ${path} on this computer. What would leave it, encrypted:\n`);
console.log(userMessage(items).split('\n').map((l) => `   ${l}`).join('\n'));

// 2. Check the hardware.
const nonce = newNonce();
const q = new URLSearchParams({ model, provider: 'near', signing_algo: 'ed25519', nonce, include_tls_fingerprint: 'false' });
const report = await (await fetch(`${base}/attestation/report?${q}`, { headers: { 'x-no-aliasing': 'true' } })).json();
const att = await verifyModelAttestation(report, { model, nonce, signingAlgo: 'ed25519', verifyQuote: quoteVerifier(), verifyGpu: gpuVerifier() });
console.log(`\n2. Hardware report for ${model}:`);
for (const c of att.checks) console.log(`   ${c.ok === true ? 'PASS' : c.ok === false ? 'FAIL' : 'SKIP'}  ${c.label}`);
if (!att.ok) {
  console.error('\nThe hardware report did not pass. Nothing was sent.');
  process.exit(1);
}

// 3. Encrypt to the attested key and send.
const client = newClientKeys();
const messages = encryptMessages(att.key.publicKey, client.publicKey, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(items) }]);
const requestBytes = new TextEncoder().encode(JSON.stringify(readingBody(model, messages)));
console.log(`\n3. Sending ${requestBytes.length.toLocaleString()} bytes; every message is ciphertext (E2EE v3) to ${att.key.publicKey.slice(0, 16)}...`);
const t0 = Date.now();
const r = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'accept-encoding': 'identity', 'x-no-aliasing': 'true', authorization: `Bearer ${key}`, ...e2eeHeaders(client.publicKey, att.key.publicKey) },
  body: requestBytes,
});
const responseBytes = new Uint8Array(await r.arrayBuffer());
if (!r.ok) {
  console.error(`   HTTP ${r.status}: ${new TextDecoder().decode(responseBytes).slice(0, 300)}`);
  process.exit(1);
}
const reply = JSON.parse(new TextDecoder().decode(responseBytes));
const choice = reply.choices?.[0];
const text = decryptWith(client.secretKey, choice?.message?.content || '');
console.log(`   Reply in ${((Date.now() - t0) / 1000).toFixed(1)} s (finish: ${choice?.finish_reason}, tokens: ${reply.usage?.total_tokens ?? '?'}), decrypted here:\n`);
console.log(text.split('\n').map((l) => `   ${l}`).join('\n'));

// 4. Check the signature.
let sig = null;
for (let i = 0; i < 6 && !sig; i++) {
  const s = await fetch(`${base}/signature/${encodeURIComponent(reply.id)}?signing_algo=ed25519`, { headers: { authorization: `Bearer ${key}`, 'x-no-aliasing': 'true' } });
  if (s.status === 404) await new Promise((ok) => setTimeout(ok, 1000));
  else sig = await s.json();
}
const v = verifyReplySignature({ sig, model, requestBytes, responseBytes, key: att.key });
console.log('\n4. Signature:');
for (const c of v.checks) console.log(`   ${c.ok ? 'PASS' : 'FAIL'}  ${c.label}`);
process.exit(v.ok ? 0 : 1);
