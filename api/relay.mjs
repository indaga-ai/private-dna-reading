// The hosted demo's relay: the same handler as `npm start`, as one Vercel function. Static files are served by
// Vercel from web/ (see vercel.json); every /api/* path is rewritten here with the original path in `__path`.
import { createHandler } from '../server/handler.mjs';
import { StandIn } from '../server/stand-in.mjs';
import { Payments } from '../server/payments.mjs';
import { configFromEnv } from '../server/config.mjs';

const cfg = configFromEnv(process.env);
const secret = process.env.PASS_SECRET ? Buffer.from(process.env.PASS_SECRET, 'hex') : undefined;
const handler = createHandler({
  ...cfg,
  standIn: new StandIn(cfg.model, secret),
  pay: cfg.payments === 'off' ? null : new Payments({ mode: cfg.payments, priceUsdc: cfg.priceUsdc, recipient: cfg.recipient, secret }),
});

/** Restores the path the browser asked for from the rewrite's __path parameter. */
export function originalUrl(rewritten) {
  const url = new URL(rewritten, 'http://relay');
  const path = url.searchParams.get('__path');
  if (path === null) return rewritten;
  url.searchParams.delete('__path');
  const rest = url.searchParams.toString();
  return `/api/${path.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
}

export default function relay(req, res) {
  req.url = originalUrl(req.url);
  return handler(req, res);
}
