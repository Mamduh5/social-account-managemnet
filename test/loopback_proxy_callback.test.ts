import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { createTestLoopbackTls } from './helpers/loopback-tls.js';
import express from 'express';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { seedInitialData } from '../server/src/db/seed.js';
import { localAccess } from '../server/src/local-access.js';
import { connectionsRouter } from '../server/src/routes/connections.routes.js';
import { createLoopbackProxy } from '../server/src/loopback-proxy.js';
import { connectionSetup } from '../server/src/services/connections.service.js';

let backendServer: http.Server;
let proxyInstance: ReturnType<typeof createLoopbackProxy>;
let backendPort: number;
let proxyPort: number;
let testAccountId: string;
let keyPath: string;
let certPath: string;
let testFetch: ReturnType<typeof createTestLoopbackTls>['fetch'];

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.TIKTOK_CLIENT_KEY = 'test-tt-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-tt-secret';

  ({ keyPath, certPath, fetch: testFetch } = createTestLoopbackTls());

  initializeDatabase();
  seedInitialData();

  // Create isolated real TikTok account
  testAccountId = `acc-tt-${randomUUID()}`;
  db.prepare(`
    INSERT OR REPLACE INTO accounts (
      id, platform, account_type, name, handle, status, connector_mode, external_id, connection_status
    ) VALUES (?, 'tiktok', 'personal', 'Test Creator', '@test_creator', 'disconnected', 'official_api', NULL, 'limited')
  `).run(testAccountId);

  // Start isolated backend server
  const app = express();
  app.use(localAccess);
  app.use(express.json());
  app.use('/api/connections', connectionsRouter);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', https_forwarded: _req.headers['x-forwarded-proto'] === 'https' }));

  await new Promise<void>((resolve) => {
    backendServer = app.listen(0, '127.0.0.1', () => {
      backendPort = (backendServer.address() as any).port;
      resolve();
    });
  });

  // Start loopback HTTPS proxy on ephemeral port forwarding to backendPort
  proxyInstance = createLoopbackProxy({
    targetPort: backendPort,
    httpsPort: 0,
    keyPath,
    certPath,
  });
  await proxyInstance.start();
  proxyPort = (proxyInstance.server.address() as any).port;
  process.env.TIKTOK_REDIRECT_URI = `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok`;
});

after(async () => {
  if (proxyInstance) await proxyInstance.stop();
  if (backendServer) {
    await new Promise<void>((resolve) => backendServer.close(() => resolve()));
  }
});

test('1. Loopback HTTPS proxy routes requests and injects forwarded headers', async () => {
  const res = await testFetch(`https://127.0.0.1:${proxyPort}/api/health`);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.equal(data.status, 'ok');
  assert.equal(data.https_forwarded, true);
});

test('2. connectionSetup recognizes loopback HTTPS redirect URI as allowed and ready', () => {
  const setup = connectionSetup('tiktok');
  assert.equal(setup.ready, true);
  assert.equal(setup.callbackAllowed, true);
  assert.equal(setup.missing.length, 0);
});

test('3. OAuth initiation through HTTPS proxy sets Secure HttpOnly cookie and builds valid authorization URL', async () => {
  const res = await testFetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://127.0.0.1:${proxyPort}`,
    },
    body: JSON.stringify({ stats: true }),
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.ok(body.authorizationUrl);

  const parsedUrl = new URL(body.authorizationUrl);
  assert.equal(parsedUrl.origin, 'https://www.tiktok.com');
  assert.equal(parsedUrl.searchParams.get('client_key'), 'test-tt-key');
  assert.equal(parsedUrl.searchParams.get('redirect_uri'), `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok`);
  assert.ok(parsedUrl.searchParams.get('state'));

  const cookieHeader = res.headers.get('set-cookie') || '';
  assert.ok(cookieHeader.includes('scc_oauth='), 'Must set scc_oauth cookie');
  assert.ok(cookieHeader.includes('HttpOnly'), 'Must be HttpOnly');
  assert.ok(cookieHeader.includes('Secure'), 'Must have Secure attribute');
  assert.ok(cookieHeader.includes('SameSite=Lax'), 'Must be SameSite=Lax');
});

test('4. Callback on HTTPS proxy rejects missing or invalid state and invalid cookies with HTTP 400', async () => {
  // Callback with invalid state
  const badStateRes = await testFetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=nonexistent_state`,
    {
      headers: {
        Cookie: 'scc_oauth=some_secret_cookie_value',
      },
      redirect: 'manual',
    }
  );

  assert.equal(badStateRes.status, 400);
  const badStateText = await badStateRes.text();
  assert.ok(badStateText.includes('Authorization session expired') || badStateText.includes('Invalid or replayed authorization state'));

  // Callback with missing cookie
  const noCookieRes = await testFetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=nonexistent_state`,
    {
      redirect: 'manual',
    }
  );
  assert.equal(noCookieRes.status, 400);
  const noCookieText = await noCookieRes.text();
  assert.ok(noCookieText.includes('authorization browser cookie is missing'));
});
