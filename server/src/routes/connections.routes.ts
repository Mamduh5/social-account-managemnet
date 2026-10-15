import { Router } from 'express';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { disconnectAccount } from '../services/accounts.service.js';
import {
  connectionSetup,
  startAuthorization,
  completeAuthorization,
  getConnectionCandidates,
  selectAuthorizedIdentity,
  refreshConnection,
  enableBrowserHandoff,
} from '../services/connections.service.js';
export const connectionsRouter = Router();
const cookieName = 'scc_oauth';
function browserCookie(req: any) {
  return (
    String(req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) || ''
  );
}
connectionsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
connectionsRouter.get('/:id/setup', (req, res) => {
  const account = accountsRepo.getAccountById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(connectionSetup(account.platform));
});
connectionsRouter.post('/:id/start', (req, res) => {
  try {
    const account = accountsRepo.getAccountById(req.params.id);
    if (account) {
      const configured =
        process.env[
          account.platform === 'facebook'
            ? 'META_REDIRECT_URI'
            : 'TIKTOK_REDIRECT_URI'
        ];
      if (configured) {
        const callback = new URL(configured);
        if (callback.hostname !== req.hostname)
          return res
            .status(409)
            .json({
              error:
                'Open Command Center using the same hostname as the registered OAuth callback so the browser session cookie remains bound correctly.',
            });
        const source =
          req.get('origin') || `${req.protocol}://${req.get('host')}`;
        if (account.platform === 'tiktok' && !source.startsWith('https://'))
          return res
            .status(409)
            .json({
              error:
                'TikTok Web Login requires HTTPS. Open Command Center through your reviewed loopback HTTPS setup before authorization.',
            });
      }
    }

    const result = startAuthorization(
      req.params.id,
      browserCookie(req),
      req.body
    );
    res.cookie(cookieName, result.browserSecret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: result.secure,
      path: '/api/connections',
      maxAge: 600000,
    });
    res.json({ authorizationUrl: result.authorizationUrl });
  } catch (e: any) {
    res
      .status(e.status || 400)
      .json({ error: e.message, ...(e.setup ? { setup: e.setup } : {}) });
  }
});
connectionsRouter.get('/callback/:platform', async (req, res) => {
  try {
    const id = await completeAuthorization(
      req.params.platform,
      req.query,
      browserCookie(req)
    );
    res.redirect('/?connectionAccount=' + encodeURIComponent(id));
  } catch {
    res
      .status(400)
      .type('text/plain')
      .send(
        'Authorization could not be completed. Return to Accounts, review app configuration, consent, selected identity and session expiry, then reconnect.'
      );
  }
});
connectionsRouter.get('/:id/candidates', (req, res) =>
  res.json({
    candidates: getConnectionCandidates(req.params.id, browserCookie(req)),
  })
);
connectionsRouter.post('/:id/select', (req, res) => {
  try {
    selectAuthorizedIdentity(req.params.id, browserCookie(req), req.body);
    res.clearCookie(cookieName, { path: '/api/connections' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
connectionsRouter.post('/:id/refresh', async (req, res) => {
  try {
    await refreshConnection(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(409).json({ error: e.message });
  }
});
connectionsRouter.post('/:id/disconnect', (req, res) => {
  if (!accountsRepo.getAccountById(req.params.id))
    return res.status(404).json({ error: 'Account not found' });
  disconnectAccount(req.params.id);
  res.json({ success: true });
});
connectionsRouter.post('/:id/browser-handoff', (req, res) => {
  try {
    enableBrowserHandoff(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
