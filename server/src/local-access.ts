import { RequestHandler } from 'express';
/** Local service boundary. No public callbacks, wildcard hosts or cross-site mutations. */
export const localAccess: RequestHandler = (req, res, next) => {
  const address = req.socket.remoteAddress || '';
  const origin = req.headers.origin;
  const allowedOrigins = [
    `http://${req.headers.host}`,
    `https://${req.headers.host}`,
    'http://localhost:5180',
    'http://127.0.0.1:5180',
  ];
  if (
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) ||
    (origin && !allowedOrigins.includes(origin)) ||
    (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['sec-fetch-site'] === 'cross-site')
  ) {
    res.status(403).json({ error: 'Local same-origin access required' });
    return;
  }
  next();
};
