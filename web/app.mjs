// The page. Everything here runs in the browser: reading the DNA file, working out the trait results, checking the
// hardware report, encrypting, decrypting and checking the signature. The server only relays ciphertext.
import { extractPanel } from '../src/genome/parse.mjs';
import { isZip, openRawDataInZip, chunksOf } from '../src/genome/unzip.mjs';
import { PANEL_RSIDS, callPanel, SAMPLES } from '../src/genome/panel.mjs';
import { verifyModelAttestation, newNonce } from '../src/tee/attestation.mjs';
import { quoteVerifier, gpuVerifier } from '../src/tee/hardware.mjs';
import { newClientKeys, encryptMessages, decryptWith, e2eeHeaders } from '../src/tee/e2ee.mjs';
import { verifyReplySignature } from '../src/tee/signature.mjs';
import { SYSTEM_PROMPT, userMessage, readingBody } from '../src/ai/prompt.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};

const state = { config: null, items: null, source: null, attestation: null, key: null, pass: null, busy: false };

function unlock(stepId, done = false) {
  const s = $(stepId);
  s.removeAttribute('data-locked');
  if (done) s.classList.add('done');
}

function setStatus(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('error', error);
}

function fmtBytes(n) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(0)} kB` : `${n} bytes`;
}

async function api(path, init) {
  const r = await fetch(path, init);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
  return data;
}

// ---- Step 1: the genome -------------------------------------------------------------------------------------

async function readGenome(chunks, label) {
  const status = $('genome-status');
  setStatus(status, `Reading ${label} on this device...`);
  const t0 = performance.now();
  const parsed = await extractPanel(chunks, PANEL_RSIDS);
  const ms = Math.round(performance.now() - t0);
  if (!parsed.rows) throw new Error('No genotype rows found. Is this a raw DNA data file?');
  state.items = callPanel(parsed.found);
  state.source = label;
  const measured = state.items.filter((i) => i.status === 'called').length;
  setStatus(status, `Read ${parsed.rows.toLocaleString()} rows${parsed.build ? ` (${parsed.build})` : ''} in ${ms} ms on this device. ${measured} of ${state.items.length} traits could be read.`);
  renderPanel();
  unlock('step-genome', true);
  unlock('step-panel', true);
  unlock('step-tee');
  $('check-tee').disabled = false;
  resetReading();
}

async function loadSample(sample, button) {
  for (const b of document.querySelectorAll('.sample')) b.setAttribute('aria-pressed', String(b === button));
  try {
    const r = await fetch(`samples/${sample.file}`);
    if (!r.ok) throw new Error(`could not load the sample (HTTP ${r.status})`);
    await readGenome(chunksOf(r.body.pipeThrough(new TextDecoderStream())), `${sample.name}'s sample file`);
  } catch (e) {
    setStatus($('genome-status'), e.message, true);
  }
}

async function loadFile(file) {
  for (const b of document.querySelectorAll('.sample')) b.setAttribute('aria-pressed', 'false');
  try {
    if (await isZip(file)) {
      const inner = await openRawDataInZip(file);
      await readGenome(chunksOf(inner.text), `${file.name} (${inner.name}, ${fmtBytes(inner.size)})`);
    } else {
      await readGenome(chunksOf(file.stream().pipeThrough(new TextDecoderStream())), `${file.name} (${fmtBytes(file.size)})`);
    }
  } catch (e) {
    setStatus($('genome-status'), e.message, true);
  }
}

// ---- Step 2: what leaves the page -----------------------------------------------------------------------------

function renderPanel() {
  const rows = state.items.map((i) => el('tr', {},
    el('td', {}, el('strong', { text: i.trait }), el('div', { class: 'muted', text: i.gene })),
    el('td', { class: 'var', text: i.variant }),
    el('td', { class: 'gt', text: i.genotype ?? '—' }),
    el('td', {}, i.result, i.caveat ? el('div', { class: 'muted', text: i.caveat }) : null),
  ));
  const table = el('div', { class: 'table-scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', { text: 'Trait' }), el('th', { text: 'Variant' }), el('th', { text: 'Genotype' }), el('th', { text: 'Result' }))),
    el('tbody', {}, rows)));
  const payload = el('details', {}, el('summary', { text: 'The exact text that will be encrypted' }), el('pre', { text: userMessage(state.items) }));
  $('panel').replaceChildren(table, payload);
}

// ---- Step 3: the hardware check -------------------------------------------------------------------------------

function renderChecks(container, checks) {
  const list = el('ul', { class: 'checks' }, checks.map((c) => el('li', { class: 'check' },
    el('span', { class: `mark ${c.ok === true ? 'ok' : c.ok === false ? 'bad' : 'skip'}`, text: c.ok === true ? '✓' : c.ok === false ? '✕' : '–', 'aria-label': c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'not checked' }),
    el('div', {}, el('div', { class: 'label', text: c.label }), el('div', { class: 'detail', text: c.detail || '' }), c.where ? el('div', { class: 'where', text: `checked: ${c.where}` }) : null),
  )));
  container.append(list);
}

async function checkHardware() {
  const out = $('tee');
  const button = $('check-tee');
  button.disabled = true;
  out.replaceChildren(el('p', { class: 'status' }, el('span', { class: 'spinner' }), 'Asking for a fresh hardware report and checking it...'));
  try {
    const nonce = newNonce();
    const report = await api(`api/attestation?nonce=${nonce}`);
    const result = await verifyModelAttestation(report, {
      model: state.config.model,
      nonce,
      signingAlgo: 'ed25519',
      verifyQuote: quoteVerifier({ pccsUrl: new URL('api/pccs', location.href).href.replace(/\/$/, '') }),
      verifyGpu: gpuVerifier({ nrasUrl: new URL('api/nras', location.href).href }),
    });
    state.attestation = result;
    out.replaceChildren(el('p', { class: 'status', text: `Nonce sent: ${nonce.slice(0, 16)}...` }));
    renderChecks(out, result.checks);
    out.append(el('div', { class: `verdict ${result.ok ? 'ok' : 'bad'}`, text: result.ok
      ? 'The model key below is held inside verified confidential hardware.'
      : 'The hardware report did not pass every check. Nothing will be sent to this key.' }));
    if (result.tee) {
      const t = result.tee;
      out.append(el('dl', { class: 'kv' },
        el('dt', { text: 'Model' }), el('dd', { text: t.model }),
        el('dt', { text: 'Model key' }), el('dd', { text: result.key ? `ed25519 ${result.key.publicKey}` : 'not trusted' }),
        el('dt', { text: 'TEE instance' }), el('dd', { text: t.instanceId || '' }),
        el('dt', { text: 'Software hash' }), el('dd', { text: t.composeHash || '' }),
      ));
      const d = t.deployLog;
      if (d?.latestComposeUp) {
        const u = d.latestComposeUp;
        const link = u.commit && u.file ? `https://github.com/nearai/cvm-compose-files/blob/${u.commit}/${u.file}` : null;
        out.append(el('p', { class: 'hint' }, 'Latest model deployment in this TEE (from its attested log): ',
          link ? el('a', { href: link, rel: 'noopener', text: `${u.file} @ ${u.commit.slice(0, 10)}` }) : `${u.file || 'unknown'}`,
          u.timestamp ? ` on ${u.timestamp.slice(0, 10)}.` : '.'));
      }
      if (t.images.length) {
        out.append(el('details', {}, el('summary', { text: `The container images this TEE was started with (${t.images.length})` }),
          el('pre', { text: t.images.map((i) => `${i.service ? `${i.service}: ` : ''}${i.image}${i.pinned ? '' : '   (not pinned by digest)'}`).join('\n') })));
      }
    }
    if (result.ok) {
      state.key = result.key;
      unlock('step-tee', true);
      if (state.config.payments !== 'off') {
        unlock('step-pay');
        renderPay();
      } else {
        unlock('step-reading');
        $('send').disabled = false;
      }
    }
  } catch (e) {
    out.replaceChildren(el('p', { class: 'status error', text: `The check could not run: ${e.message}` }));
  } finally {
    button.disabled = false;
    button.textContent = 'Check again';
  }
}

// ---- Step 4: payment ------------------------------------------------------------------------------------------

async function renderPay() {
  const box = $('pay');
  box.replaceChildren(el('p', { class: 'status' }, el('span', { class: 'spinner' }), 'Loading live prices from NEAR Intents...'));
  try {
    const { coins, priceUsdc, mode } = await api('api/pay/coins');
    const intro = mode === 'simulated'
      ? `A reading costs ${priceUsdc} USDC, payable in any of these coins. The prices below are live NEAR Intents quotes; this public demo takes no real payment, so a button stands in for sending the coins.`
      : `A reading costs ${priceUsdc} USDC, payable in any of these coins. You get a one-time deposit address on that coin's own chain.`;
    const quoteBox = el('div');
    const refund = mode === 'live' ? el('input', { type: 'text', placeholder: 'Your refund address on the same chain (used only if the payment fails)', 'aria-label': 'Refund address' }) : null;
    const coinButtons = coins.map((c) => el('button', {
      type: 'button',
      'aria-pressed': 'false',
      onclick: async (ev) => {
        for (const b of ev.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget));
        await getQuote(c, quoteBox, refund, mode);
      },
    }, c.label));
    box.replaceChildren(...[el('p', { class: 'hint', text: intro }), refund, el('div', { class: 'coins' }, coinButtons), quoteBox].filter(Boolean));
  } catch (e) {
    box.replaceChildren(el('p', { class: 'status error', text: `Prices could not be loaded: ${e.message}` }));
  }
}

async function getQuote(coin, box, refund, mode) {
  box.replaceChildren(el('p', { class: 'status' }, el('span', { class: 'spinner' }), `Asking NEAR Intents for a ${coin.label} quote...`));
  try {
    const q = await api('api/pay/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetId: coin.assetId, refundTo: refund?.value || undefined }) });
    const amount = el('div', { class: 'amount', text: `${q.amountIn} ${q.coin.symbol}` });
    const usd = el('div', { class: 'muted', text: `about $${Number(q.amountInUsd).toFixed(2)}; solvers deliver exactly ${q.amountOut} USDC; usually ~${q.timeEstimate} s` });
    if (mode === 'simulated') {
      const pay = el('button', { class: 'primary', type: 'button', onclick: async () => {
        pay.disabled = true;
        const s = await api('api/pay/simulate', { method: 'POST' });
        state.pass = s.pass;
        box.append(el('p', { class: 'status', text: 'Payment simulated. A reading pass was issued.' }));
        unlock('step-pay', true);
        unlock('step-reading');
        $('send').disabled = false;
      } }, 'Simulate the payment');
      box.replaceChildren(el('div', { class: 'quote' }, amount, usd), el('p', {}, pay));
    } else {
      const status = el('p', { class: 'status', text: 'Waiting for your deposit...' });
      box.replaceChildren(el('div', { class: 'quote' }, el('div', { text: 'Send exactly' }), amount, usd,
        el('div', { text: `to this one-time ${q.coin.label} address:` }), el('div', { class: 'addr', text: q.depositAddress }),
        q.depositMemo ? el('div', { class: 'addr', text: `memo: ${q.depositMemo}` }) : null,
        el('div', { class: 'muted', text: `before ${new Date(q.deadline).toLocaleString()}` })), status);
      pollPayment(q.depositAddress, status);
    }
  } catch (e) {
    box.replaceChildren(el('p', { class: 'status error', text: e.message }));
  }
}

async function pollPayment(address, status) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const s = await api(`api/pay/status?depositAddress=${encodeURIComponent(address)}`);
      setStatus(status, `Payment status: ${s.status}${s.onChain ? (s.onChain.enough ? ' · USDC confirmed on NEAR' : ' · waiting for the USDC on NEAR') : ''}`);
      if (s.pass) {
        state.pass = s.pass;
        unlock('step-pay', true);
        unlock('step-reading');
        $('send').disabled = false;
        return;
      }
      if (['REFUNDED', 'FAILED'].includes(s.status)) return;
    } catch (e) {
      setStatus(status, `Status check failed, retrying: ${e.message}`, true);
    }
  }
}

// ---- Step 5: the reading --------------------------------------------------------------------------------------

function resetReading() {
  $('reading').replaceChildren();
  $('send').disabled = !state.key;
}

function renderReadingText(text) {
  const box = el('div', { class: 'reading-text' });
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.length > 1 && lines[0].length < 60 && !/[.!?]$/.test(lines[0])) {
      box.append(el('h3', { text: lines[0] }), el('p', { text: lines.slice(1).join(' ') }));
    } else {
      box.append(el('p', { text: lines.join(' ') }));
    }
  }
  return box;
}

// NEAR AI Cloud records the signature a moment after the reply; retry a 404 a few times, about a second apart.
async function fetchSignature(id) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`api/signature/${encodeURIComponent(id)}`);
    if (r.status === 404) {
      await new Promise((ok) => setTimeout(ok, 1000));
      continue;
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `signature lookup failed (HTTP ${r.status})`);
    return data;
  }
  return { error_code: 'not_found', message: 'no signature was recorded for this reply' };
}

async function sendReading() {
  const out = $('reading');
  const button = $('send');
  button.disabled = true;
  const live = state.config.inference === 'near-ai-cloud';
  const modelKey = live ? state.key.publicKey : state.config.standInKey;
  const signKey = live ? state.key : { algo: 'ed25519', publicKey: modelKey, address: modelKey, standIn: true };
  try {
    const client = newClientKeys();
    const messages = encryptMessages(modelKey, client.publicKey, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(state.items) }]);
    const requestBytes = new TextEncoder().encode(JSON.stringify(readingBody(state.config.model, messages)));
    out.replaceChildren(
      el('details', { open: true }, el('summary', { text: `What our server and NEAR's gateway see: ${fmtBytes(requestBytes.length)} of ciphertext` }),
        el('pre', { text: `${messages[1].content.slice(0, 600)}...` })),
      el('p', { class: 'status' }, el('span', { class: 'spinner' }), live ? 'The model is writing inside the TEE...' : 'The stand-in is writing...'),
    );
    const headers = { 'content-type': 'application/json', ...e2eeHeaders(client.publicKey, modelKey) };
    if (state.pass) headers['x-reading-pass'] = state.pass;
    const r = await fetch('api/reading', { method: 'POST', headers, body: requestBytes });
    const responseBytes = new Uint8Array(await r.arrayBuffer());
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        msg = JSON.parse(new TextDecoder().decode(responseBytes)).error?.message || msg;
      } catch { /* keep the status */ }
      throw new Error(msg);
    }
    const reply = JSON.parse(new TextDecoder().decode(responseBytes));
    const choice = reply.choices?.[0];
    const text = decryptWith(client.secretKey, choice?.message?.content || '');
    out.lastChild.replaceWith(el('p', { class: 'status', text: 'Decrypted on this device with a key made for this visit. Checking the signature...' }));
    out.append(renderReadingText(text));
    if (choice?.finish_reason === 'length') out.append(el('p', { class: 'status', text: 'The reading reached its length limit and may end mid-sentence.' }));
    const sig = await fetchSignature(reply.id);
    const v = verifyReplySignature({ sig, model: state.config.model, requestBytes, responseBytes, key: signKey });
    renderChecks(out, v.checks);
    if (!live) out.append(el('div', { class: 'verdict bad', text: 'Stand-in mode: this server has no NEAR AI Cloud key, so the reply came from a local stand-in. Its key is not the attested one.' }));
    else out.append(el('div', { class: `verdict ${v.ok ? 'ok' : 'bad'}`, text: v.ok ? 'This reply was signed inside the verified hardware, for exactly this request.' : 'The signature check failed: do not trust this reply.' }));
    unlock('step-reading', v.ok && live);
  } catch (e) {
    out.append(el('p', { class: 'status error', text: `The reading failed: ${e.message}` }));
  } finally {
    button.disabled = false;
    button.textContent = 'Send again';
  }
}

// ---- Start ----------------------------------------------------------------------------------------------------

async function start() {
  try {
    state.config = await api('api/config');
  } catch (e) {
    setStatus($('genome-status'), `The server is not reachable: ${e.message}`, true);
    return;
  }
  const c = state.config;
  const banner = $('mode-banner');
  if (c.inference !== 'near-ai-cloud') {
    banner.hidden = false;
    banner.replaceChildren(el('strong', { text: 'Stand-in mode. ' }), 'This server has no NEAR AI Cloud key. The hardware check below still runs against NEAR AI Cloud, but the reading comes from a local stand-in model with its own unattested key.');
  }
  if (c.payments !== 'off') {
    $('step-pay').hidden = false;
    $('reading-num').textContent = '5';
  }
  $('samples').replaceChildren(...SAMPLES.map((s) => {
    const b = el('button', { class: 'sample', type: 'button', 'aria-pressed': 'false' }, el('strong', { text: s.name }), el('small', { text: s.blurb }));
    b.addEventListener('click', () => loadSample(s, b));
    return b;
  }));
  if (c.hosted) $('own-file-off').hidden = false;
  else {
    $('own-file').hidden = false;
    $('file-input').addEventListener('change', (e) => e.target.files[0] && loadFile(e.target.files[0]));
  }
  $('check-tee').addEventListener('click', checkHardware);
  $('send').addEventListener('click', sendReading);
}

start();
