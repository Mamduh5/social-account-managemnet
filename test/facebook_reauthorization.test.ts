import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { db } from '../server/src/db/database.js';
import { initializeDatabase } from '../server/src/db/schema.js';
import { saveRegisteredAccount, indexExistingIdentities } from '../server/src/services/accounts.service.js';
import { accountsRepo } from '../server/src/repositories/accounts.repo.js';
import { accountConnectionsRepo } from '../server/src/repositories/account-connections.repo.js';
import { startAuthorization, completeAuthorization, selectAuthorizedIdentity, getConnectionCandidates } from '../server/src/services/connections.service.js';
import { seal, unseal } from '../server/src/services/token-protection.js';
import { connectionsRouter } from '../server/src/routes/connections.routes.js';
import { localAccess } from '../server/src/local-access.js';
import { getConnector } from '../server/src/connectors/registry.js';

const originalFetch = globalThis.fetch;
let handler: (url: string, init: RequestInit) => Response;
let id: string;
let server: any;
let base: string;
let requests: Array<{ url: string; init: RequestInit }> = [];
const logs: string[] = [];
const originalWarn = console.warn;
const originalInfo = console.info;
const forbidden = ['fixture-code-secret', 'fixture-page-token', 'fixture-user-token', 'fixture-app-secret'];
const scopes = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts'];
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status });
function provider(url: string, init: RequestInit) {
  if (url.includes('/oauth/access_token')) return response({ access_token: 'fixture-user-token' });
  if (url.includes('/debug_token')) return response({ data: { app_id: 'fixture-app', is_valid: true, expires_at: Math.floor(Date.now()/1000) + 7200 } });
  if (url.includes('/me/permissions')) return response({ data: scopes.map(permission => ({ permission, status: 'granted' })) });
  if (url.includes('/me/accounts')) return response({ data: [{ id: '409347032254077', name: 'Renamed Page', access_token: 'fixture-page-token', tasks: ['CREATE_CONTENT'] }] });
  if (url.includes('/61563944843401?fields=id')) return response({ id: '409347032254077' });
  throw new Error('Unexpected fixture request');
}
function start() {
  handler = provider;
  requests = [];
  const flow = startAuthorization(id, '', { publishing: true });
  const state = new URL(flow.authorizationUrl).searchParams.get('state')!;
  return { ...flow, state };
}
async function complete(flow: ReturnType<typeof start>) {
  return completeAuthorization('facebook', { code: 'fixture-code-secret', state: flow.state }, flow.browserSecret);
}
function link(flow: ReturnType<typeof start>, externalId = '409347032254077') {
  selectAuthorizedIdentity(id, flow.browserSecret, { externalId, confirmIdentity: true });
}
function saved() { return accountsRepo.getAccountById(id) as any; }
function credentials() {
  const a = saved();
  return [a.access_token, a.refresh_token, a.external_id, a.identity_verified_at, a.granted_scopes_json];
}

before(async () => {
  assert.ok(process.env.SCC_DATA_DIR, 'Use npm test for isolated storage');
  process.env.SCC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.META_APP_ID = 'fixture-app';
  process.env.META_APP_SECRET = 'fixture-app-secret';
  process.env.META_GRAPH_VERSION = 'v26.0';
  initializeDatabase();
  id = saveRegisteredAccount({ platform: 'facebook', name: 'Original Page', handle: 'https://www.facebook.com/profile.php?id=61563944843401', externalId: '61563944843401' });
  indexExistingIdentities();
  const app = express(); app.use(localAccess); app.use(express.json()); app.use('/api/connections', connectionsRouter);
  server = await new Promise<any>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.META_REDIRECT_URI = `${base}/api/connections/callback/facebook`;
  console.warn = (...args) => { logs.push(args.join(' ')); };
  console.info = (...args) => { logs.push(args.join(' ')); };
  globalThis.fetch = (async (url: any, init: RequestInit = {}) => {
    if (String(url).startsWith(base)) return originalFetch(url, init);
    requests.push({ url: String(url), init });
    return handler(String(url), init);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = originalFetch; console.warn = originalWarn; console.info = originalInfo;
  await new Promise<void>(resolve => server.close(() => resolve())); db.close();
});

test('missing expires_in is verified through Meta; canonical original ID binds to the same internal account', async () => {
  const flow = start();
  assert.equal(new URL(flow.authorizationUrl).searchParams.get('redirect_uri'), process.env.META_REDIRECT_URI);
  assert.equal(new URL(flow.authorizationUrl).searchParams.get('auth_type'), 'rerequest');
  await complete(flow);
  assert.equal(requests.filter(r => r.url.includes('/debug_token')).length, 1);
  const exchange = requests.find(r => r.url.endsWith('/oauth/access_token'))!;
  assert.equal((exchange.init.body as URLSearchParams).get('redirect_uri'), process.env.META_REDIRECT_URI);
  link(flow);
  assert.equal(saved().id, id);
  assert.equal(saved().external_id, '409347032254077');
  assert.equal(unseal(saved().access_token), 'fixture-page-token');
  assert.equal(getConnector(saved()).getCapabilities().canPublish, true);
  assert.equal(accountConnectionsRepo.findIdentity('facebook', 'external:409347032254077').account_id, id);
  assert.equal(accountConnectionsRepo.findIdentity('facebook', 'external:61563944843401').account_id, id);
});

test('existing verified Page reauthorization accepts a changed display name and its own identity claim', async () => {
  const count = (db.prepare('SELECT count(*) n FROM accounts').get() as any).n;
  const flow = start();
  await complete(flow);
  link(flow);
  assert.equal(saved().external_id, '409347032254077');
  assert.equal((db.prepare('SELECT count(*) n FROM accounts').get() as any).n, count);
  assert.equal(requests.some(r => r.url.includes('/61563944843401?')), false);
});

test('an existing trusted Page ID alias reconnects an unverified legacy registration without name matching or duplicate rejection', async () => {
  db.prepare('UPDATE accounts SET external_id=?,identity_verified_at=NULL WHERE id=?').run('61563944843401', id);
  const flow = start(); await complete(flow); link(flow);
  assert.equal(saved().external_id, '409347032254077');
  assert.equal(requests.some(r => r.url.includes('/61563944843401?')), false);
});

test('a requested but declined pages_manage_posts is reported at scope validation and preserves valid credentials', async () => {
  const before = credentials();
  const flow = start();
  handler = (url, init) => url.includes('/me/permissions') ? response({ data: scopes.map(permission => ({ permission, status: permission === 'pages_manage_posts' ? 'declined' : 'granted' })) }) : provider(url, init);
  await assert.rejects(complete(flow), /scope_validation.*did not grant pages_manage_posts/);
  assert.deepEqual(credentials(), before);
  assert.equal(requests.some(r => r.url.includes('/me/accounts')), false);
});

test('missing expiry never bypasses verification: invalid app, invalid token, unknown or expired metadata fail closed', async () => {
  for (const data of [
    { app_id: 'another-app', is_valid: true, expires_at: 0 },
    { app_id: 'fixture-app', is_valid: false, expires_at: 0 },
    { app_id: 'fixture-app', is_valid: true },
    { app_id: 'fixture-app', is_valid: true, expires_at: 1 },
  ]) {
    const before = credentials(); const flow = start();
    handler = (url, init) => url.includes('/debug_token') ? response({ data }) : provider(url, init);
    await assert.rejects(complete(flow), /token_validation/);
    assert.deepEqual(credentials(), before);
  }
});

test('Meta explicitly nonexpiring token receives a bounded local revalidation window', async () => {
  const flow = start();
  handler = (url, init) => url.includes('/debug_token') ? response({ data: { app_id: 'fixture-app', is_valid: true, expires_at: 0 } }) : provider(url, init);
  await complete(flow); link(flow);
  const lifetime = Date.parse(saved().token_expires_at) - Date.now();
  assert.ok(lifetime > 23 * 3600000 && lifetime <= 24 * 3600000);
});

test('same display name cannot rebind a verified account to a different Page', async () => {
  const before = credentials(); const flow = start();
  handler = (url, init) => url.includes('/me/accounts') ? response({ data: [{ id: '999999', name: saved().name, access_token: 'other-token' }] }) : provider(url, init);
  await assert.rejects(complete(flow), /identity_matching/);
  assert.deepEqual(credentials(), before);
});

test('duplicate identity on a different account is rejected transactionally, but the same account can reauthorize', async () => {
  const other = saveRegisteredAccount({ platform: 'facebook', name: 'Other', handle: 'fixture.other', externalId: '999999' });
  const flow = start(); await complete(flow);
  db.prepare('UPDATE account_identities SET account_id=? WHERE identity_key=?').run(other, 'external:409347032254077');
  const before = credentials();
  assert.throws(() => link(flow), /identity_matching.*another registered account/);
  assert.deepEqual(credentials(), before);
  db.prepare('UPDATE account_identities SET account_id=? WHERE identity_key=?').run(id, 'external:409347032254077');
  link(flow);
});

test('wrong state, missing cookie and callback replay cannot consume a valid selection', async () => {
  const flow = start();
  await assert.rejects(completeAuthorization('facebook', { state: 'raw-state-secret', code: 'fixture-code-secret' }, flow.browserSecret), /state_validation/);
  await assert.rejects(completeAuthorization('facebook', { state: flow.state, code: 'fixture-code-secret' }, ''), /session_validation/);
  assert.equal(requests.length, 0);
  await complete(flow);
  await assert.rejects(complete(flow), /state_validation/);
  assert.equal(getConnectionCandidates(id, flow.browserSecret).length, 1);
  link(flow);
  await assert.rejects(complete(flow), /session_validation/);
});

test('Meta errors, network and encryption failures remain stage-specific without leaking credentials', async () => {
  const before = credentials();
  let flow = start();
  handler = () => response({ error: { code: 100, error_subcode: 36008, message: forbidden.join(' ') } }, 400);
  await assert.rejects(complete(flow), /code_exchange/);
  assert.ok(logs.some(l => l.includes('"code":100') && l.includes('"subcode":36008')));
  flow = start(); handler = () => { throw new TypeError(forbidden.join(' ')); };
  await assert.rejects(complete(flow), /code_exchange.*could not reach/);
  flow = start();
  const key = process.env.SCC_TOKEN_ENCRYPTION_KEY!;
  handler = (url, init) => { if (url.includes('/me/accounts')) delete process.env.SCC_TOKEN_ENCRYPTION_KEY; return provider(url, init); };
  await assert.rejects(complete(flow), /candidate_encryption/);
  process.env.SCC_TOKEN_ENCRYPTION_KEY = key;
  assert.deepEqual(credentials(), before);
  const output = logs.join('\n');
  for (const secret of [...forbidden, 'raw-state-secret', flow.state, flow.browserSecret, key]) assert.equal(output.includes(secret), false);
});

test('HTTP callback and start validate exact callback origin, expose safe diagnostics and keep cookie protections', async () => {
  const post = () => originalFetch(`${base}/api/connections/${id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"publishing":true}' });
  const expected = process.env.META_REDIRECT_URI!;
  for (const uri of [expected.replace('127.0.0.1', 'localhost'), expected.replace('http:', 'https:'), expected.replace(new URL(base).port, '3001'), expected + '/']) {
    process.env.META_REDIRECT_URI = uri;
    assert.equal((await post()).status, 409);
  }
  process.env.META_REDIRECT_URI = expected;
  const r = await post(); assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\/api\/connections/);
  const url = new URL((await r.json() as any).authorizationUrl);
  handler = provider;
  const callback = await originalFetch(`${expected}?state=${url.searchParams.get('state')}&code=fixture-code-secret`, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' });
  assert.equal(callback.status, 302);
  const failure = await originalFetch(`${expected}?state=raw-state-secret&code=fixture-code-secret`, { headers: { Cookie: cookie.split(';')[0] } });
  const message = await failure.text();
  assert.equal(failure.status, 400); assert.match(message, /state_validation/);
  for (const secret of [...forbidden, 'raw-state-secret']) assert.equal(message.includes(secret), false);
});
