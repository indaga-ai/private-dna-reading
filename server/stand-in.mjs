// A stand-in for the model, used when the server has no NEAR AI Cloud key, so anyone can run the whole flow.
// It speaks the same protocol: it decrypts the request with its own Ed25519 key, writes a plain template reading
// from the fixed results, encrypts the reply to the browser's key and signs the exchange. It has NO hardware
// attestation, and the page says so: its key is not the attested model key.
import { ed25519 } from '@noble/curves/ed25519.js';
import { decryptWith, encryptTo, requestFieldAad } from '../src/tee/e2ee.mjs';
import { signedText } from '../src/tee/signature.mjs';
import { bytesToHex, utf8ToBytes, randomBytes } from '../src/util/bytes.mjs';

export class StandIn {
  constructor(model) {
    this.model = model;
    this.secretKey = ed25519.utils.randomSecretKey();
    this.publicKey = bytesToHex(ed25519.getPublicKey(this.secretKey));
    this.signatures = new Map();
  }

  reply(userText) {
    const items = userText.split('\n').slice(1).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
    const parts = ['Stand-in reading: this server has no NEAR AI Cloud key, so a local template wrote this from the fixed results.', ''];
    for (const t of items) {
      parts.push(`${t.trait}`);
      parts.push(t.genotype === 'not measured' ? 'Not measured in this file.' : `${t.result}${t.caveat ? ` ${t.caveat}` : ''}`);
      parts.push('');
    }
    parts.push('This reading is for curiosity only and is not medical advice.');
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

  signature(id) {
    const s = this.signatures.get(id);
    return s ? { status: 200, bytes: Buffer.from(JSON.stringify(s)) } : { status: 404, bytes: Buffer.from(JSON.stringify({ error: { message: 'not found' } })) };
  }
}
