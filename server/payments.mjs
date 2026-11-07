// Pay for a reading with any coin, through NEAR Intents 1Click (https://1click.chaindefuser.com).
// The buyer gets a one-time deposit address on their own chain; solvers swap whatever arrives into exactly the
// price in USDC, delivered to the operator's NEAR Intents account. 1Click has no webhooks, so the server polls
// /v0/status, then confirms on chain that the USDC arrived before it issues a reading pass.
//
// PAYMENTS=off        no payment step (your own key, your own reading)
// PAYMENTS=simulated  live prices from real dry quotes, but no deposit address; a button stands in for paying.
//                     This is what the public demo runs.
// PAYMENTS=live       real deposit addresses; needs RECIPIENT. Mainnet only (Intents has no testnet): small amounts.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.mjs';

export const USDC_ON_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const INTENTS_CONTRACT = 'intents.near';

// What the page offers, by symbol and chain. Asset ids are looked up live in /v0/tokens.
export const OFFERED = [
  { symbol: 'BTC', blockchain: 'btc', label: 'Bitcoin' },
  { symbol: 'ETH', blockchain: 'eth', label: 'Ether' },
  { symbol: 'ETH', blockchain: 'base', label: 'Ether on Base' },
  { symbol: 'SOL', blockchain: 'sol', label: 'Solana' },
  { symbol: 'USDC', blockchain: 'sol', label: 'USDC on Solana' },
  { symbol: 'USDC', blockchain: 'base', label: 'USDC on Base' },
  { symbol: 'USDT', blockchain: 'tron', label: 'USDT on Tron' },
  { symbol: 'wNEAR', blockchain: 'near', label: 'NEAR' },
  { symbol: 'ZEC', blockchain: 'zec', label: 'Zcash' },
  { symbol: 'DOGE', blockchain: 'doge', label: 'Dogecoin' },
  { symbol: 'XRP', blockchain: 'xrp', label: 'XRP' },
];
const SLOW = new Set(['btc', 'zec', 'doge', 'ltc', 'bch']);

/** USDC base units (6 decimals) from a decimal string such as "1.00". */
export function usdcUnits(price) {
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(String(price));
  if (!m) throw new Error(`bad price: ${price}`);
  return (BigInt(m[1]) * 1_000_000n + BigInt((m[2] || '').padEnd(6, '0'))).toString();
}

export class Payments {
  constructor({ mode, priceUsdc, recipient, oneClickJwt = '', secret, fetch = globalThis.fetch, rpc = 'https://free.rpc.fastnear.com', now = () => Date.now() }) {
    this.mode = mode;
    this.price = String(priceUsdc);
    this.amount = usdcUnits(priceUsdc);
    this.recipient = recipient;
    this.jwt = oneClickJwt;
    this.secret = secret || randomBytes(32);
    this.fetch = fetch;
    this.rpc = rpc;
    this.now = now;
    this.tokens = null;
    this.tokensAt = 0;
    this.orders = new Map(); // depositAddress -> { assetId, balanceBefore, createdAt, passIssued }
    this.spent = new Map(); // pass id -> readings used
  }

  async oneClick(path, init = {}) {
    const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) };
    if (this.jwt) headers.authorization = `Bearer ${this.jwt}`;
    const r = await this.fetch(`https://1click.chaindefuser.com${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: r.status, json };
  }

  async coins() {
    if (!this.tokens || this.now() - this.tokensAt > 10 * 60_000) {
      const r = await this.oneClick('/v0/tokens');
      if (r.status !== 200 || !Array.isArray(r.json)) throw new HttpError(502, 'tokens_unavailable', 'NEAR Intents token list unavailable');
      this.tokens = r.json;
      this.tokensAt = this.now();
    }
    return OFFERED.map((o) => {
      const t = this.tokens.find((x) => x.symbol === o.symbol && x.blockchain === o.blockchain);
      return t ? { ...o, assetId: t.assetId, decimals: t.decimals, priceUsd: t.price } : null;
    }).filter(Boolean);
  }

  quoteBody({ assetId, blockchain, refundTo, dry }) {
    const minutes = SLOW.has(blockchain) ? 120 : 30;
    return {
      dry,
      swapType: 'EXACT_OUTPUT',
      slippageTolerance: 100,
      originAsset: assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: USDC_ON_NEAR,
      amount: this.amount,
      refundTo,
      refundType: 'ORIGIN_CHAIN',
      recipient: this.recipient || 'demo.near',
      recipientType: 'INTENTS',
      deadline: new Date(this.now() + minutes * 60_000).toISOString(),
      referral: 'private-dna-reading',
    };
  }

  /** The merchant's USDC balance inside the NEAR Intents contract (a free view call). */
  async intentsBalance() {
    const args = Buffer.from(JSON.stringify({ account_id: this.recipient, token_id: USDC_ON_NEAR })).toString('base64');
    const r = await this.fetch(this.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'b', method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: INTENTS_CONTRACT, method_name: 'mt_balance_of', args_base64: args } }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = await r.json();
    if (!j?.result?.result) throw new Error('balance unavailable');
    return BigInt(JSON.parse(Buffer.from(j.result.result).toString('utf8')));
  }

  issuePass(id) {
    const body = Buffer.from(JSON.stringify({ id, exp: this.now() + 60 * 60_000, uses: 3 })).toString('base64url');
    const mac = createHmac('sha256', this.secret).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  /** Checks a pass and spends one reading from it. */
  async redeem(pass) {
    const [body, mac] = String(pass || '').split('.');
    if (!body || !mac) throw new HttpError(402, 'payment_required', 'Pay for the reading first.');
    const want = createHmac('sha256', this.secret).update(body).digest();
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(402, 'payment_required', 'This reading pass is not valid.');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp < this.now()) throw new HttpError(402, 'payment_required', 'This reading pass has expired.');
    const used = this.spent.get(p.id) || 0;
    if (used >= p.uses) throw new HttpError(402, 'payment_required', 'This reading pass is used up.');
    this.spent.set(p.id, used + 1);
  }

  async handle(req, res, url, { send, readBody, ip, lookups }) {
    const route = url.pathname;
    lookups.take(ip);

    if (route === '/api/pay/coins' && req.method === 'GET') {
      return send(res, 200, { mode: this.mode, priceUsdc: this.price, coins: await this.coins() });
    }

    if (route === '/api/pay/quote' && req.method === 'POST') {
      const { assetId, refundTo } = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}');
      const coin = (await this.coins()).find((c) => c.assetId === assetId);
      if (!coin) throw new HttpError(400, 'unknown_coin', 'That coin is not offered.');
      const live = this.mode === 'live';
      if (live && !(typeof refundTo === 'string' && refundTo.length >= 20 && refundTo.length <= 120)) {
        throw new HttpError(400, 'refund_address', 'Give a refund address on the same chain, in case the payment cannot be completed.');
      }
      // A dry quote creates nothing; it needs a syntactically valid refund address on the coin's chain only for live.
      const body = this.quoteBody({ assetId, blockchain: coin.blockchain, refundTo: live ? refundTo.trim() : (refundTo || this.recipient || 'demo.near'), dry: !live });
      if (!live) body.refundType = 'INTENTS';
      const r = await this.oneClick('/v0/quote', { method: 'POST', body: JSON.stringify(body) });
      const q = r.json?.quote;
      if (r.status < 200 || r.status >= 300 || !q) {
        const msg = String((r.json && (r.json.message || r.json.error)) || `quote failed (HTTP ${r.status})`);
        // "Amount is too low for bridge, try at least 4832025": the minimum, in USDC base units.
        const min = /try at least (\d+)/.exec(msg);
        if (min) throw new HttpError(400, 'below_minimum', `${coin.label} needs at least ${(Number(min[1]) / 1e6).toFixed(2)} USDC per payment right now; pick another coin.`);
        throw new HttpError(r.status === 400 ? 400 : 502, 'quote_failed', msg.slice(0, 200));
      }
      const out = {
        mode: this.mode,
        coin: { label: coin.label, symbol: coin.symbol, blockchain: coin.blockchain },
        amountIn: q.amountInFormatted,
        amountInUsd: q.amountInUsd,
        amountOut: q.amountOutFormatted,
        timeEstimate: q.timeEstimate,
      };
      if (live) {
        out.depositAddress = q.depositAddress;
        out.depositMemo = q.depositMemo || null;
        out.deadline = q.deadline;
        this.orders.set(q.depositAddress, { assetId, createdAt: this.now(), balanceBefore: await this.intentsBalance().catch(() => null), passIssued: false });
      }
      return send(res, 200, out);
    }

    if (route === '/api/pay/simulate' && req.method === 'POST') {
      if (this.mode !== 'simulated') throw new HttpError(404, 'not_found', 'no such route');
      return send(res, 200, { pass: this.issuePass(`sim-${randomBytes(9).toString('hex')}`), simulated: true });
    }

    if (route === '/api/pay/status' && req.method === 'GET') {
      if (this.mode !== 'live') throw new HttpError(404, 'not_found', 'no such route');
      const addr = url.searchParams.get('depositAddress') || '';
      const order = this.orders.get(addr);
      if (!order) throw new HttpError(404, 'unknown_order', 'unknown deposit address');
      const r = await this.oneClick(`/v0/status?${new URLSearchParams({ depositAddress: addr })}`);
      const status = r.json?.status || 'UNKNOWN';
      const out = { status, explorer: r.json?.swapDetails?.originChainTxHashes?.[0]?.explorerUrl || null };
      if (status === 'SUCCESS' && !order.passIssued) {
        // Proof before the pass: the USDC must be in the operator's Intents account, not just reported by 1Click.
        const after = await this.intentsBalance();
        const gained = order.balanceBefore === null ? null : after - order.balanceBefore;
        const enough = gained !== null && gained >= BigInt(this.amount);
        out.onChain = { checked: true, gained: gained === null ? null : gained.toString(), enough };
        if (enough) {
          order.passIssued = true;
          out.pass = this.issuePass(`paid-${addr}`);
        }
      }
      return send(res, 200, out);
    }

    throw new HttpError(404, 'not_found', 'no such route');
  }
}
