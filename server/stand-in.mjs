// A stand-in for the model, used when the server has no NEAR AI Cloud key, so anyone can run the whole flow.
// It speaks the same protocol: it decrypts the request with its own Ed25519 key, writes a plain template reading
// from the fixed results, encrypts the reply to the browser's key and signs the exchange. It has NO hardware
// attestation, and the page says so: its key is not the attested model key.
import { ed25519 } from '@noble/curves/ed25519.js';
import { decryptWith, encryptTo, requestFieldAad } from '../src/tee/e2ee.mjs';
import { signedText } from '../src/tee/signature.mjs';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes, randomBytes, concatBytes } from '../src/util/bytes.mjs';

export class StandIn {
  // With a seed (the hosted demo passes its server secret), every serverless instance derives the same stand-in
  // key, so a request can land on any instance.
  constructor(model, seed) {
    this.model = model;
    this.secretKey = seed ? sha256(concatBytes(seed, utf8ToBytes('stand-in-key-v1'))) : ed25519.utils.randomSecretKey();
    this.publicKey = bytesToHex(ed25519.getPublicKey(this.secretKey));
    this.signatures = new Map();
  }

  reply(userText) {
    // The message is JSON lines under the headings "Traits:", "Watch:" and "Together:" (src/ai/prompt.mjs).
    const items = userText.split('\n').map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const parts = ['Stand-in reading: this server has no NEAR AI Cloud key, so a local template wrote this from the fixed results.', ''];
    for (const t of items.filter((x) => x.trait)) {
      parts.push(`${t.trait}`);
      parts.push(t.genotype === 'not measured' ? 'Not measured in this file.' : `${t.result}${t.caveat ? ` ${t.caveat}` : ''}`);
      parts.push('');
    }
    for (const w of items.filter((x) => x.measure)) {
      parts.push(`${w.measure}`);
      parts.push(w.average === 'not measured' ? 'Not measured: too few days of this.' : `${w.average.toLocaleString('en-US')} ${w.unit} on average. ${w.note}`);
      parts.push('');
    }
    for (const t of items.filter((x) => x.link)) {
      parts.push(`${t.link}`);
      parts.push(t.note);
      parts.push('');
    }
    parts.push('This reading is for curiosity and wellness only and is not medical advice.');
    return parts.join('\n');
  }

  async chat(rawBytes, headers) {
    const err = (status, message) => ({ status, bytes: Buffer.from(JSON.stringify({ error: { message, type: 'e2ee_error' } })) });
    if (headers['x-model-pub-key'] !== this.publicKey) return err(400, 'X-Model-Pub-Key is not this model\'s key');
    let body;
    let messages;
    try {
      body = JSON.parse(Buffer.from(rawBytes).toString('utf8'));
      // Version 3: each field is bound to the client key in X-Client-Pub-Key; a swapped key fails here.
      const aad = requestFieldAad(headers['x-client-pub-key']);
      messages = body.messages.map((m) => ({ role: m.role, content: decryptWith(this.secretKey, m.content, aad) }));
    } catch {
      return err(400, 'could not decrypt the request');
    }
    const id = `chatcmpl-standin-${bytesToHex(randomBytes(12))}`;
    const text = this.reply(messages.find((m) => m.role === 'user')?.content || '');
    const response = {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{ index: 0, message: { role: 'assistant', content: encryptTo(headers['x-client-pub-key'], text) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const bytes = Buffer.from(JSON.stringify(response));
    const signed = signedText(this.model, rawBytes, bytes);
    this.signatures.set(id, {
      text: signed,
      signature: bytesToHex(ed25519.sign(utf8ToBytes(signed), this.secretKey)),
      signing_address: this.publicKey,
      signing_algo: 'ed25519',
      signature_kind: 'provider_tee',
    });
    if (this.signatures.size > 500) this.signatures.delete(this.signatures.keys().next().value);
    return { status: 200, bytes };
  }

  /**
   * The stored signature, or, when the reply was made on another serverless instance, a fresh one over the hashes
   * the page sends. That makes the stand-in sign whatever hashes it is given; harmless, because its key is not
   * attested and the page labels everything it signs as the stand-in's.
   */
  signature(id, hashes) {
    let s = this.signatures.get(id);
    if (!s && /^chatcmpl-standin-[0-9a-f]{24}$/.test(id) && /^[0-9a-f]{64}:[0-9a-f]{64}$/.test(hashes || '')) {
      const text = `${this.model}:${hashes}`;
      s = { text, signature: bytesToHex(ed25519.sign(utf8ToBytes(text), this.secretKey)), signing_address: this.publicKey, signing_algo: 'ed25519', signature_kind: 'provider_tee' };
    }
    return s ? { status: 200, bytes: Buffer.from(JSON.stringify(s)) } : { status: 404, bytes: Buffer.from(JSON.stringify({ error: { message: 'not found' } })) };
  }
}
