import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { saveRegisteredAccount, indexExistingIdentities } from '../server/src/services/accounts.service.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { accountConnectionsRepo } from '../server/src/repositories/account-connections.repo.js';
import { seal, unseal } from '../server/src/services/token-protection.js';
import { ensureFreshToken, revalidateFacebookConnection } from '../server/src/services/connections.service.js';
import { getConnector } from '../server/src/connectors/registry.js';

const originalFetch = globalThis.fetch;
let handler: (url: string, init: RequestInit) => Response;
let id: string;
const pageExternalId = '409347032254077';
const requests: Array<{ url: string; init: RequestInit }> = [];
const scopes = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts'];
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status });

function defaultProvider(url: string, _init: RequestInit) {
  if (url.includes('/debug_token')) {
    return response({
      data: {
        app_id: 'fixture-app',
        type: 'PAGE',
        is_valid: true,
        expires_at: 0,
        data_access_expires_at: Math.floor(Date.now() / 1000) + 86400 * 60,
        profile_id: pageExternalId,
        scopes,
      },
    });
  }
  if (url.includes('/me?fields=id,name')) {
    return response({ id: pageExternalId, name: 'Verified Test Page' });
  }
  throw new Error(`Unexpected fixture request to: ${url}`);
}

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.META_APP_ID = 'fixture-app';
  process.env.META_APP_SECRET = 'fixture-app-secret';
  process.env.META_GRAPH_VERSION = 'v26.0';

  initializeDatabase();
  id = saveRegisteredAccount({
    platform: 'facebook',
    name: 'Verified Test Page',
    handle: '@409347032254077',
    externalId: pageExternalId,
  });
  indexExistingIdentities();

  globalThis.fetch = (async (url: any, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

test('1. Expired 24h window revalidates securely with Meta debug_token and /me, extending expiry', async () => {
  handler = defaultProvider;
  requests.length = 0;

  // Set up account with past 24-hour expiration window
  const pastExpiry = new Date(Date.now() - 3600 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: pastExpiry,
    refreshExpiresAt: null,
    scopes,
  });

  const accountBefore = accountsRepo.getAccountById(id) as any;
  assert.equal(accountBefore.token_expires_at, pastExpiry);
  const initialRevision = accountBefore.connection_revision;

  // Execute ensureFreshToken
  const accountAfter = await ensureFreshToken(accountBefore);

  assert.ok(accountAfter, 'Account returned');
  const newExpiry = Date.parse(accountAfter.token_expires_at);
  assert.ok(newExpiry > Date.now() + 23 * 3600 * 1000, 'Expiry extended by bounded 24h window');
  assert.equal(accountAfter.status, 'connected');
  assert.equal(accountAfter.connection_status, 'connected');
  assert.ok(accountAfter.connection_revision > initialRevision, 'Revision incremented');
  assert.ok(accountAfter.health_status.includes('Verified Test Page'));

  // Verify Meta API calls were made
  assert.ok(requests.some((r) => r.url.includes('/debug_token')), 'Called debug_token');
  assert.ok(requests.some((r) => r.url.includes('/me?fields=id,name')), 'Called /me to verify identity');

  // Verify connector capabilities
  const connector = getConnector(accountAfter);
  assert.equal(connector.getCapabilities().canPublish, true, 'canPublish restored');
  assert.equal(connector.getCapabilities().canReadPostMetrics, true, 'canReadPostMetrics restored');
});

test('2. Token expiring within 30 minutes is proactively revalidated', async () => {
  handler = defaultProvider;
  requests.length = 0;

  // Set up account with expiry in 15 minutes
  const soonExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: soonExpiry,
    refreshExpiresAt: null,
    scopes,
  });

  const accountBefore = accountsRepo.getAccountById(id) as any;
  const accountAfter = await ensureFreshToken(accountBefore);

  const newExpiry = Date.parse(accountAfter.token_expires_at);
  assert.ok(newExpiry > Date.now() + 23 * 3600 * 1000, 'Proactively extended');
  assert.equal(accountAfter.status, 'connected');
});

test('3. Fresh token (>30 minutes remaining) does not trigger unnecessary network revalidation', async () => {
  handler = defaultProvider;
  requests.length = 0;

  // Set up account with expiry in 12 hours
  const freshExpiry = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: freshExpiry,
    refreshExpiresAt: null,
    scopes,
  });

  const accountBefore = accountsRepo.getAccountById(id) as any;
  const accountAfter = await ensureFreshToken(accountBefore);

  assert.equal(accountAfter.token_expires_at, freshExpiry);
  assert.equal(requests.length, 0, 'No HTTP requests made for fresh token');
});

test('4. Confirmed revocation from Meta sets connection_status to expired and requires re-auth', async () => {
  handler = (url: string) => {
    if (url.includes('/debug_token')) {
      return response({
        error: {
          message: 'Error validating access token: Session has expired.',
          type: 'OAuthException',
          code: 190,
          error_subcode: 463,
        },
      }, 400);
    }
    throw new Error('Should not reach here');
  };
  requests.length = 0;

  const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-revoked-token'),
    refreshToken: null,
    expiresAt: expiredTime,
    refreshExpiresAt: null,
    scopes,
  });

  const account = accountsRepo.getAccountById(id) as any;
  await assert.rejects(
    async () => {
      await ensureFreshToken(account);
    },
    (err: any) => {
      assert.equal(err.reason, 'invalid_grant');
      return true;
    }
  );

  const accountAfter = accountsRepo.getAccountById(id) as any;
  assert.equal(accountAfter.connection_status, 'expired');
  assert.ok(accountAfter.access_token, 'Stored credentials preserved for audit');
});

test('5. Meta App ID mismatch fails closed without extending token expiry', async () => {
  handler = (url: string) => {
    if (url.includes('/debug_token')) {
      return response({
        data: {
          app_id: 'some-other-unrelated-app',
          is_valid: true,
          expires_at: 0,
          profile_id: pageExternalId,
          scopes,
        },
      });
    }
    throw new Error('Should not reach here');
  };

  const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: expiredTime,
    refreshExpiresAt: null,
    scopes,
  });

  const account = accountsRepo.getAccountById(id) as any;
  await assert.rejects(
    async () => {
      await ensureFreshToken(account);
    },
    (err: any) => {
      assert.equal(err.reason, 'app_mismatch');
      return true;
    }
  );

  const accountAfter = accountsRepo.getAccountById(id) as any;
  assert.equal(accountAfter.token_expires_at, expiredTime, 'Expiry not modified');
});

test('6. Meta Page ID mismatch fails closed', async () => {
  handler = (url: string) => {
    if (url.includes('/debug_token')) {
      return response({
        data: {
          app_id: 'fixture-app',
          is_valid: true,
          expires_at: 0,
          profile_id: 'different-page-id',
          scopes,
        },
      });
    }
    if (url.includes('/me?fields=id,name')) {
      return response({ id: 'different-page-id', name: 'Imposter Page' });
    }
    throw new Error('Should not reach here');
  };

  const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: expiredTime,
    refreshExpiresAt: null,
    scopes,
  });

  const account = accountsRepo.getAccountById(id) as any;
  await assert.rejects(
    async () => {
      await ensureFreshToken(account);
    },
    (err: any) => {
      assert.equal(err.reason, 'identity_mismatch');
      return true;
    }
  );
});

test('7. Temporary network / HTTP 500 error preserves connection and credentials without expiring', async () => {
  handler = (url: string) => {
    if (url.includes('/debug_token')) {
      return response({ error: { message: 'Internal Server Error' } }, 500);
    }
    throw new Error('Should not reach here');
  };

  const soonExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  accountConnectionsRepo.saveConnection(id, {
    id: pageExternalId,
    accessToken: seal('fixture-page-token'),
    refreshToken: null,
    expiresAt: soonExpiry,
    refreshExpiresAt: null,
    scopes,
  });

  const account = accountsRepo.getAccountById(id) as any;
  // Should not throw or mark as revoked; returns account
  const result = await ensureFreshToken(account);
  assert.equal(result.id, id);

  const accountAfter = accountsRepo.getAccountById(id) as any;
  assert.notEqual(accountAfter.connection_status, 'expired', 'Not falsely marked expired on temporary 500');
  assert.ok(accountAfter.access_token, 'Credentials preserved');
});
