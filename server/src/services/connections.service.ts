import { randomBytes, createHash } from 'node:crypto';
import { accountConnectionsRepo as registry } from '../repositories/account-connections.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { claimIdentity, disconnectAccount } from './accounts.service.js';
import { seal, unseal, tokenProtectionReady } from './token-protection.js';
import { normalizeIdentity } from '../domain/account-identity.js';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const version = () => {
  const v = process.env.META_GRAPH_VERSION || '';
  if (!/^v\d+\.\d+$/.test(v)) throw new Error('Invalid META_GRAPH_VERSION');
  return v;
};
export function connectionSetup(platform: string) {
  const prefix = platform === 'facebook' ? 'META' : 'TIKTOK';
  const required =
    platform === 'facebook'
      ? [
          'META_APP_ID',
          'META_APP_SECRET',
          'META_REDIRECT_URI',
          'META_GRAPH_VERSION',
        ]
      : ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'];
  const missing = required.filter((k) => !process.env[k]);
  if (!tokenProtectionReady()) missing.push('SCC_TOKEN_ENCRYPTION_KEY');
  const redirect = process.env[`${prefix}_REDIRECT_URI`] || '';
  let callbackAllowed = false;
  try {
    const url = new URL(redirect);
    callbackAllowed =
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      ['http:', 'https:'].includes(url.protocol) &&
      url.pathname === `/api/connections/callback/${platform}`;
    if (platform === 'tiktok' && url.protocol !== 'https:')
      callbackAllowed = false;
  } catch {}
  let validVersion = true;
  if (platform === 'facebook') {
    try {
      version();
    } catch {
      validVersion = false;
    }
  }
  return {
    ready: missing.length === 0 && callbackAllowed && validVersion,
    missing,
    callbackAllowed,
    message:
      'Configure the official developer app, exact redirect URI and server encryption key. Public callbacks require a separate security review. TikTok Web Login Kit requires HTTPS and an accepted registered redirect URI.',
    docsUrl:
      platform === 'facebook'
        ? 'https://developers.facebook.com/docs/pages-api/getting-started/'
        : 'https://developers.tiktok.com/doc/login-kit-web/',
  };
}
function pending(browser: string, accountId?: string) {
  const row = registry.findSession(hash(browser)) as any;
  if (!row || (accountId && row.account_id !== accountId))
    throw new Error('Authorization session expired; start again');
  const account = accountsRepo.getAccountById(row.account_id) as any;
  if (
    !account ||
    account.archived_at ||
    account.connection_revision !== row.revision
  )
    throw new Error('Account connection changed; start authorization again');
  return { row, account };
}
async function jsonFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  const data = (await response.json()) as any;
  if (!response.ok || (data.error && data.error.code !== 'ok'))
    throw new Error(
      'Platform authorization failed or required permission was denied. Check app approval and reconnect.'
    );
  return data;
}
function updateConnection(account: any, item: any) {
  if (!item.id || !item.accessToken)
    throw new Error('Platform returned an incomplete identity');
  if (account.external_id && account.external_id !== item.id)
    throw new Error(
      'Authorized account does not match the registered external ID'
    );
  if (
    account.platform === 'tiktok' &&
    !account.external_id &&
    (!item.username ||
      normalizeIdentity('tiktok', item.username).key !==
        normalizeIdentity('tiktok', account.handle).key)
  )
    throw new Error(
      'Authorized TikTok username does not match the registered account'
    );
  registry.transaction(() => {
    claimIdentity(account.platform, `external:${item.id}`, account.id);
    if (item.username)
      claimIdentity(
        account.platform,
        normalizeIdentity(account.platform, item.username).key,
        account.id
      );
    registry.saveConnection(account.id, {
      ...item,
      accessToken: seal(item.accessToken),
      refreshToken: item.refreshToken ? seal(item.refreshToken) : null,
      refreshExpiresAt: item.refreshExpiresAt || null,
    });
  });
}

export function startAuthorization(
  accountId: string,
  browser: string,
  options: any
) {
  const account = accountsRepo.getAccountById(accountId) as any;
  if (!account || account.archived_at || account.is_demo)
    throw new Error('Select an active real account');
  const setup = connectionSetup(account.platform);
  if (!setup.ready)
    throw Object.assign(
      new Error('Developer-app setup is required before authorization'),
      { setup, status: 409 }
    );
  const state = randomBytes(32).toString('hex');
  const browserSecret = randomBytes(32).toString('hex');
  const scope =
    account.platform === 'facebook'
      ? ['pages_show_list']
      : ['user.info.basic', 'user.info.profile'];
  if (account.platform === 'facebook' && options.publishing === true)
    scope.push('pages_read_engagement', 'pages_manage_posts');
  if (account.platform === 'facebook' && options.engagement === true)
    scope.push(
      'pages_read_engagement',
      'pages_read_user_content',
      'pages_manage_engagement'
    );
  const redirect =
    process.env[
      account.platform === 'facebook'
        ? 'META_REDIRECT_URI'
        : 'TIKTOK_REDIRECT_URI'
    ]!;
  const url = new URL(
    account.platform === 'facebook'
      ? `https://www.facebook.com/${version()}/dialog/oauth`
      : 'https://www.tiktok.com/v2/auth/authorize/'
  );
  url.search = new URLSearchParams({
    [account.platform === 'facebook' ? 'client_id' : 'client_key']:
      process.env[
        account.platform === 'facebook' ? 'META_APP_ID' : 'TIKTOK_CLIENT_KEY'
      ]!,
    redirect_uri: redirect,
    response_type: 'code',
    scope: [...new Set(scope)].join(','),
    state,
  }).toString();
  registry.beginSession(
    {
      stateHash: hash(state),
      browserHash: hash(browserSecret),
      accountId: account.id,
      revision: account.connection_revision + 1,
      expiresAt: Date.now() + 10 * 60000,
    },
    hash(browser)
  );
  return {
    authorizationUrl: url.href,
    browserSecret,
    secure: redirect.startsWith('https:'),
  };
}

export async function completeAuthorization(
  platform: string,
  query: any,
  browser: string
) {
  let current: any;
  try {
    const { row, account } = pending(browser);
    current = account;
    if (
      account.platform !== platform ||
      hash(String(query.state || '')) !== row.state_hash ||
      row.phase !== 'started'
    )
      throw new Error('Invalid or replayed authorization state');
    registry.exchanging(row.state_hash);
    if (query.error || !query.code)
      throw new Error('Authorization denied or cancelled');
    const code = String(query.code);
    let items: any[] = [];
    if (account.platform === 'facebook') {
      const params = new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: process.env.META_REDIRECT_URI!,
        code,
      });
      const token = await jsonFetch(
        `https://graph.facebook.com/${version()}/oauth/access_token`,
        { method: 'POST', body: params }
      );
      if (!token.access_token || !token.expires_in)
        throw new Error('Missing Meta token or expiry');
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const permissions = await jsonFetch(
        `https://graph.facebook.com/${version()}/me/permissions`,
        { headers }
      );
      const scopes = (permissions.data || [])
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      if (!scopes.includes('pages_show_list'))
        throw new Error('Page discovery consent was not granted');
      let after = '';
      do {
        const params = new URLSearchParams({
          fields: 'id,name,access_token,tasks',
          limit: '100',
          ...(after ? { after } : {}),
        });
        const pages = await jsonFetch(
          `https://graph.facebook.com/${version()}/me/accounts?${params}`,
          { headers }
        );
        items.push(
          ...(pages.data || []).map((page: any) => ({
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            scopes: scopes.filter((s: string) =>
              s === 'pages_manage_posts'
                ? page.tasks?.some((t: string) =>
                    [
                      'CREATE_CONTENT',
                      'MANAGE',
                      'PROFILE_PLUS_CREATE_CONTENT',
                      'PROFILE_PLUS_FULL_CONTROL',
                      'PROFILE_PLUS_MANAGE',
                    ].includes(t)
                  )
                : s === 'pages_manage_engagement'
                  ? page.tasks?.some((t: string) =>
                      [
                        'MODERATE',
                        'MANAGE',
                        'PROFILE_PLUS_MODERATE',
                        'PROFILE_PLUS_FULL_CONTROL',
                        'PROFILE_PLUS_MANAGE',
                      ].includes(t)
                    )
                  : true
            ),
            expiresAt: new Date(
              Date.now() + token.expires_in * 1000
            ).toISOString(),
          }))
        );
        after = pages.paging?.next ? pages.paging?.cursors?.after : '';
        if (items.length > 10000)
          throw new Error(
            'Too many Pages to select; narrow developer app access'
          );
      } while (after);
      if (!items.length)
        throw new Error(
          'No manageable Pages returned; review Page roles and app access'
        );
    } else {
      const token = await jsonFetch(
        'https://open.tiktokapis.com/v2/oauth/token/',
        {
          method: 'POST',
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY!,
            client_secret: process.env.TIKTOK_CLIENT_SECRET!,
            grant_type: 'authorization_code',
            redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
            code,
          }),
        }
      );
      const scopes = String(token.scope || '').split(',');
      const fields =
        'open_id,display_name,avatar_url' +
        (scopes.includes('user.info.profile') ? ',username' : '');
      const info = await jsonFetch(
        `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`,
        { headers: { Authorization: `Bearer ${token.access_token}` } }
      );
      const user = info.data?.user;
      if (!user?.open_id || user.open_id !== token.open_id || !token.expires_in)
        throw new Error('TikTok returned an incomplete identity');
      items = [
        {
          id: user.open_id,
          name: user.display_name,
          username: user.username,
          scopes,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: new Date(
            Date.now() + token.expires_in * 1000
          ).toISOString(),
          refreshExpiresAt: new Date(
            Date.now() + token.refresh_expires_in * 1000
          ).toISOString(),
        },
      ];
    }
    // Re-read after network calls: disconnect/archive/edit must invalidate in-flight callbacks.
    pending(browser, account.id);
    registry.saveCandidates(row.state_hash, seal(JSON.stringify(items)));
    return account.id;
  } catch (e: any) {
    if (current) {
      const a = accountsRepo.getAccountById(current.id) as any;
      if (a?.connection_revision === current.connection_revision) {
        registry.connectionStatus(
          current.id,
          'connection_error',
          'Authorization failed or denied. Review developer setup and reconnect.'
        );
        registry.clearSessions(current.id);
      }
    }
    throw new Error(
      'Authorization could not be completed. Review developer setup, consent, selected identity and session expiry, then reconnect.'
    );
  }
}

export function getConnectionCandidates(id: string, browser: string) {
  try {
    const { row } = pending(browser, id);
    const items =
      row.phase === 'selecting' ? JSON.parse(unseal(row.payload)!) : [];
    return items.map((i: any) => ({
      id: i.id,
      name: i.name,
      username: i.username,
      scopes: i.scopes,
    }));
  } catch {
    return [];
  }
}
export function selectAuthorizedIdentity(
  id: string,
  browser: string,
  input: any
) {
  const { row, account } = pending(browser, id);
  if (row.phase !== 'selecting')
    throw new Error('Complete official authorization first');
  const item = JSON.parse(unseal(row.payload)!).find(
    (i: any) => i.id === input.externalId
  );
  if (!item || input.confirmIdentity !== true)
    throw new Error('Confirm that this identity is the registered account');
  updateConnection(account, item);
}
export async function refreshConnection(id: string) {
  const account = accountsRepo.getAccountById(id) as any;
  if (
    !account ||
    account.is_demo ||
    account.archived_at ||
    account.platform !== 'tiktok' ||
    !account.refresh_token ||
    !account.identity_verified_at ||
    !account.refresh_expires_at ||
    Date.parse(account.refresh_expires_at) <= Date.now()
  )
    throw new Error('Official reauthorization required');
  try {
    const token = await jsonFetch(
      'https://open.tiktokapis.com/v2/oauth/token/',
      {
        method: 'POST',
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY!,
          client_secret: process.env.TIKTOK_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: unseal(account.refresh_token)!,
        }),
      }
    );
    if (
      token.open_id !== account.external_id ||
      !token.access_token ||
      !token.refresh_token ||
      !token.expires_in
    )
      throw new Error('Token identity mismatch');
    const current = accountsRepo.getAccountById(account.id) as any;
    if (current.connection_revision !== account.connection_revision)
      throw new Error('Account connection changed');
    updateConnection(current, {
      id: token.open_id,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      refreshExpiresAt: new Date(
        Date.now() + token.refresh_expires_in * 1000
      ).toISOString(),
      scopes: String(token.scope || '').split(','),
    });
  } catch {
    throw new Error(
      'Token renewal failed; reconnect through official authorization'
    );
  }
}
export function enableBrowserHandoff(id: string) {
  const account = accountsRepo.getAccountById(id) as any;
  if (!account || account.is_demo || account.archived_at)
    throw new Error('Select an active real account');
  disconnectAccount(account.id);
  registry.browserHandoff(account.id);
}
