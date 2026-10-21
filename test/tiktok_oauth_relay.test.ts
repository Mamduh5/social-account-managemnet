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
import worker from '../public-site/src/worker.js';

let backendServer: http.Server;
let proxyInstance: ReturnType<typeof createLoopbackProxy>;
let backendPort: number;
let proxyPort: number;
let testAccountId: string;
let keyPath: string;
let certPath: string;
let testFetch: ReturnType<typeof createTestLoopbackTls>['fetch'];
const originalFetch = globalThis.fetch;
let lastTokenExchangePayload: URLSearchParams | null = null;

const PUBLIC_CALLBACK_URI = 'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok';

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.TIKTOK_CLIENT_KEY = 'test-tt-key';
  process.env.TIKTOK_CLIENT_SECRET = 'test-tt-secret';
  process.env.TIKTOK_REDIRECT_URI = PUBLIC_CALLBACK_URI;

  ({ keyPath, certPath, fetch: testFetch } = createTestLoopbackTls());

  initializeDatabase();
  seedInitialData();

  // Create isolated real TikTok account
  testAccountId = `acc-tt-${randomUUID()}`;
  db.prepare(`
    INSERT OR REPLACE INTO accounts (
      id, platform, account_type, name, handle, status, connector_mode, external_id, connection_status
    ) VALUES (?, 'tiktok', 'personal', 'Test Relay Creator', '@test_relay_creator', 'disconnected', 'official_api', NULL, 'limited')
  `).run(testAccountId);

  // Start isolated backend server
  const app = express();
  app.use(localAccess);
  app.use(express.json());
  app.use('/api/connections', connectionsRouter);

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

  // Intercept TikTok backchannel OAuth calls
  globalThis.fetch = async (inputUrl: any, opts: any) => {
    const urlStr = String(inputUrl);
    if (urlStr.includes('/oauth/token/')) {
      lastTokenExchangePayload = new URLSearchParams(opts?.body);
      return new Response(
        JSON.stringify({
          access_token: 'act.test-tiktok-relay-token-999',
          expires_in: 86400,
          open_id: 'open-id-relay-test-user',
          refresh_expires_in: 31536000,
          refresh_token: 'rft.test-tiktok-relay-refresh-999',
          scope: 'user.info.basic,user.info.profile,video.list',
          token_type: 'Bearer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/user/info/')) {
      return new Response(
        JSON.stringify({
          data: {
            user: {
              open_id: 'open-id-relay-test-user',
              display_name: 'Relay Test Creator',
              username: 'test_relay_creator',
              avatar_url: 'https://example.com/avatar.jpg',
            },
          },
          error: { code: 'ok', message: '' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return testFetch(inputUrl, opts);
  };
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (proxyInstance) await proxyInstance.stop();
  if (backendServer) {
    await new Promise<void>((resolve) => backendServer.close(() => resolve()));
  }
});

// ============================================================================
// PART 1: Cloudflare Worker OAuth Callback Relay Unit Tests
// ============================================================================

test('1. Worker Relay: valid callback with code and state returns 302 to local HTTPS with strict security headers', async () => {
  const req = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=mock_code_123&state=mock_state_456'
  );
  const res = await worker.fetch(req, {} as any, {} as any);

  assert.equal(res.status, 302);
  const location = res.headers.get('Location');
  assert.equal(
    location,
    'https://localhost:3443/api/connections/callback/tiktok?code=mock_code_123&state=mock_state_456'
  );
  assert.equal(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, private');
  assert.equal(res.headers.get('Pragma'), 'no-cache');
  assert.equal(res.headers.get('Expires'), '0');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
});

test('2. Worker Relay: denied consent or error from TikTok returns 302 to local HTTPS preserving error parameters', async () => {
  const req = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?error=access_denied&error_description=User+cancelled&state=mock_state_456'
  );
  const res = await worker.fetch(req, {} as any, {} as any);

  assert.equal(res.status, 302);
  const location = res.headers.get('Location');
  assert.equal(
    location,
    'https://localhost:3443/api/connections/callback/tiktok?state=mock_state_456&error=access_denied&error_description=User+cancelled'
  );
  assert.equal(res.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, private');
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
});

test('3. Worker Relay: rejects non-GET HTTP methods with 405 Method Not Allowed', async () => {
  const postReq = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok',
    { method: 'POST', body: JSON.stringify({ code: 'abc', state: 'xyz' }) }
  );
  const res = await worker.fetch(postReq, {} as any, {} as any);

  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'GET');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('4. Worker Relay: rejects malformed parameters (missing state, missing code/error, excessive length, control chars) with 400', async () => {
  // Missing state
  const noState = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=mock_code'
  );
  const noStateRes = await worker.fetch(noState, {} as any, {} as any);
  assert.equal(noStateRes.status, 400);
  assert.ok((await noStateRes.text()).includes('Missing required OAuth parameter (state)'));

  // Missing both code and error
  const noCodeOrError = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?state=mock_state'
  );
  const noCodeRes = await worker.fetch(noCodeOrError, {} as any, {} as any);
  assert.equal(noCodeRes.status, 400);
  assert.ok((await noCodeRes.text()).includes('Missing required OAuth parameter (code or error)'));

  // Excessive parameter length (state > 512 chars)
  const longState = new Request(
    `https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=mock_code&state=${'a'.repeat(600)}`
  );
  const longRes = await worker.fetch(longState, {} as any, {} as any);
  assert.equal(longRes.status, 400);
  assert.ok((await longRes.text()).includes('Invalid or malformed OAuth parameter'));

  // Valid long OAuth code (e.g. 500 chars) is accepted
  const validLongCode = new Request(
    `https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=${'c'.repeat(500)}&state=valid_state`
  );
  const validLongRes = await worker.fetch(validLongCode, {} as any, {} as any);
  assert.equal(validLongRes.status, 302);

  // Control characters
  const ctrlChar = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=mock_code%00&state=mock_state'
  );
  const ctrlRes = await worker.fetch(ctrlChar, {} as any, {} as any);
  assert.equal(ctrlRes.status, 400);
  assert.ok((await ctrlRes.text()).includes('Invalid or malformed OAuth parameter'));
});

test('5. Worker Relay: prevents open redirects by discarding user-supplied redirect targets', async () => {
  const req = new Request(
    'https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/connections/callback/tiktok?code=valid_code&state=valid_state&redirect_to=https://evil.example.com&destination=https://attacker.com'
  );
  const res = await worker.fetch(req, {} as any, {} as any);

  assert.equal(res.status, 302);
  const location = res.headers.get('Location')!;
  const parsed = new URL(location);
  assert.equal(parsed.origin, 'https://localhost:3443');
  assert.equal(parsed.pathname, '/api/connections/callback/tiktok');
  assert.equal(parsed.searchParams.get('code'), 'valid_code');
  assert.equal(parsed.searchParams.get('state'), 'valid_state');
  assert.equal(parsed.searchParams.has('redirect_to'), false);
  assert.equal(parsed.searchParams.has('destination'), false);
});

test('6. Worker Relay: passes through normal static website requests and never proxies management APIs', async () => {
  let assetsCalled = false;
  let requestedPath = '';
  const mockEnv = {
    ASSETS: {
      fetch: async (r: Request) => {
        assetsCalled = true;
        requestedPath = new URL(r.url).pathname;
        return new Response('Mock Static Content', { status: 200 });
      },
    },
  };

  // Normal static page
  const homeReq = new Request('https://billowing-leaf-7ccd.mamduh2542.workers.dev/privacy');
  const homeRes = await worker.fetch(homeReq, mockEnv as any, {} as any);
  assert.equal(homeRes.status, 200);
  assert.equal(assetsCalled, true);
  assert.equal(requestedPath, '/privacy');

  // Unrelated API endpoint is sent to static assets (which returns 404 in production), never proxied to localhost
  assetsCalled = false;
  const apiReq = new Request('https://billowing-leaf-7ccd.mamduh2542.workers.dev/api/health');
  await worker.fetch(apiReq, mockEnv as any, {} as any);
  assert.equal(assetsCalled, true);
  assert.equal(requestedPath, '/api/health');
});

// ============================================================================
// PART 2: Local Application End-to-End Handling & Security Regressions
// ============================================================================

test('7. Local Application: connectionSetup recognizes public relay redirect URI as ready', () => {
  const setup = connectionSetup('tiktok');
  assert.equal(setup.ready, true);
  assert.equal(setup.callbackAllowed, true);
  assert.equal(setup.missing.length, 0);
});

test('8. Local Application: OAuth start builds authorization URL with public callback and sets Secure cookie', async () => {
  const res = await fetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
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
  assert.equal(parsedUrl.searchParams.get('redirect_uri'), PUBLIC_CALLBACK_URI);
  assert.ok(parsedUrl.searchParams.get('state'));

  const cookieHeader = res.headers.get('set-cookie') || '';
  assert.ok(cookieHeader.includes('scc_oauth='), 'Must set scc_oauth cookie');
  assert.ok(cookieHeader.includes('HttpOnly'), 'Must be HttpOnly');
  assert.ok(cookieHeader.includes('Secure'), 'Must have Secure attribute');
  assert.ok(cookieHeader.includes('SameSite=Lax'), 'Must be SameSite=Lax');
});

test('9. Local Application: successful callback through simulated relay bounce exchanges token using public URI', async () => {
  // Initiate fresh session
  const startRes = await fetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://127.0.0.1:${proxyPort}`,
    },
    body: JSON.stringify({ stats: false }),
  });
  const startBody = (await startRes.json()) as any;
  assert.ok(startBody.authorizationUrl, 'Must return authorizationUrl');
  const state = new URL(startBody.authorizationUrl).searchParams.get('state')!;
  const cookieHeader = startRes.headers.get('set-cookie') || '';
  const cookieMatch = cookieHeader.match(/scc_oauth=([^;]+)/);
  assert.ok(cookieMatch, 'Cookie must exist');
  const cookieVal = cookieMatch[0];

  lastTokenExchangePayload = null;

  // Simulate browser following 302 bounce to local HTTPS callback
  const callbackRes = await fetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_relay_code_abc&state=${state}`,
    {
      headers: { Cookie: cookieVal },
      redirect: 'manual',
    }
  );

  assert.equal(callbackRes.status, 302);
  const target = callbackRes.headers.get('Location');
  assert.ok(target?.includes('connectionAccount='));

  // CRITICAL VERIFICATION: Token exchange must use the exact registered public callback URI
  assert.ok(lastTokenExchangePayload);
  assert.equal(lastTokenExchangePayload.get('client_key'), 'test-tt-key');
  assert.equal(lastTokenExchangePayload.get('client_secret'), 'test-tt-secret');
  assert.equal(lastTokenExchangePayload.get('grant_type'), 'authorization_code');
  assert.equal(lastTokenExchangePayload.get('code'), 'mock_relay_code_abc');
  assert.equal(lastTokenExchangePayload.get('redirect_uri'), PUBLIC_CALLBACK_URI);
});

test('10. Local Application: denied consent callback from TikTok fails gracefully with 400', async () => {
  // Initiate fresh session
  const startRes = await fetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://127.0.0.1:${proxyPort}`,
    },
    body: JSON.stringify({ stats: false }),
  });
  const startBody = (await startRes.json()) as any;
  assert.ok(startBody.authorizationUrl, 'Must return authorizationUrl');
  const state = new URL(startBody.authorizationUrl).searchParams.get('state')!;
  const cookieVal = (startRes.headers.get('set-cookie') || '').match(/scc_oauth=([^;]+)/)![0];

  // Callback with error=access_denied
  const callbackRes = await fetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?error=access_denied&error_description=User+cancelled&state=${state}`,
    {
      headers: { Cookie: cookieVal },
      redirect: 'manual',
    }
  );

  assert.equal(callbackRes.status, 400);
  const text = await callbackRes.text();
  assert.ok(text.includes('TikTok denied or cancelled authorization'));
});

test('11. Local Application: duplicate callback replay is rejected with 400', async () => {
  // Initiate fresh session
  const startRes = await fetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://127.0.0.1:${proxyPort}`,
    },
    body: JSON.stringify({ stats: false }),
  });
  const startBody = (await startRes.json()) as any;
  assert.ok(startBody.authorizationUrl, 'Must return authorizationUrl');
  const state = new URL(startBody.authorizationUrl).searchParams.get('state')!;
  const cookieVal = (startRes.headers.get('set-cookie') || '').match(/scc_oauth=([^;]+)/)![0];

  // First callback consumes the session
  const firstRes = await fetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=${state}`,
    {
      headers: { Cookie: cookieVal },
      redirect: 'manual',
    }
  );
  assert.equal(firstRes.status, 302);

  // Second duplicate replay
  const replayRes = await fetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=${state}`,
    {
      headers: { Cookie: cookieVal },
      redirect: 'manual',
    }
  );

  assert.equal(replayRes.status, 400);
  const replayText = await replayRes.text();
  assert.ok(replayText.includes('Invalid or replayed authorization state') || replayText.includes('session expired'));
});

test('12. Local Application: expired or invalid authorization state is rejected with 400', async () => {
  // Attempt callback with non-existent or expired state/cookie
  const expiredRes = await fetch(
    `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=non_existent_expired_state`,
    {
      headers: { Cookie: 'scc_oauth=expired_or_invalid_cookie' },
      redirect: 'manual',
    }
  );

  assert.equal(expiredRes.status, 400);
  const text = await expiredRes.text();
  assert.ok(text.includes('Authorization session expired') || text.includes('Invalid or replayed authorization state'));
});

test('13. Local Application: callback rejected if redirect URI configuration changed during authorization', async () => {
  // Initiate session with current redirect URI
  const startRes = await fetch(`https://127.0.0.1:${proxyPort}/api/connections/${testAccountId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: `https://127.0.0.1:${proxyPort}`,
    },
    body: JSON.stringify({ stats: false }),
  });
  const startBody = (await startRes.json()) as any;
  assert.ok(startBody.authorizationUrl, 'Must return authorizationUrl');
  const state = new URL(startBody.authorizationUrl).searchParams.get('state')!;
  const cookieVal = (startRes.headers.get('set-cookie') || '').match(/scc_oauth=([^;]+)/)![0];

  // Tamper environment variable
  const originalUri = process.env.TIKTOK_REDIRECT_URI;
  try {
    process.env.TIKTOK_REDIRECT_URI = 'https://other-domain.workers.dev/api/connections/callback/tiktok';

    const callbackRes = await fetch(
      `https://127.0.0.1:${proxyPort}/api/connections/callback/tiktok?code=mock_code&state=${state}`,
      {
        headers: { Cookie: cookieVal },
        redirect: 'manual',
      }
    );

    assert.equal(callbackRes.status, 400);
    const text = await callbackRes.text();
    assert.ok(text.includes('callback configuration changed during authorization'));
  } finally {
    process.env.TIKTOK_REDIRECT_URI = originalUri;
  }
});
