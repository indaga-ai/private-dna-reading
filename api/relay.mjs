// The hosted demo's relay: the same handler as `npm start`, as one Vercel function. Static files are served by
// Vercel from web/ (see vercel.json); every /api/* path is rewritten here.
import { createHandler } from '../server/handler.mjs';
import { StandIn } from '../server/stand-in.mjs';
import { Payments } from '../server/payments.mjs';
import { configFromEnv } from '../server/config.mjs';

const cfg = configFromEnv(process.env);
const secret = process.env.PASS_SECRET ? Buffer.from(process.env.PASS_SECRET, 'hex') : undefined;
const handler = createHandler({
  ...cfg,
  standIn: new StandIn(cfg.model),
  pay: cfg.payments === 'off' ? null : new Payments({ mode: cfg.payments, priceUsdc: cfg.priceUsdc, recipient: cfg.recipient, secret }),
});

export default function relay(req, res) {
  // Vercel keeps the original path in req.url after a rewrite; fall back to the forwarded one if it does not.
  const original = req.headers['x-forwarded-uri'] || req.headers['x-vercel-original-path'];
  if (original && !String(req.url).startsWith('/api/') ) req.url = original;
  return handler(req, res);
}
