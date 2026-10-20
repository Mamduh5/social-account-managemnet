import { randomBytes, createHash } from 'node:crypto';
import { accountConnectionsRepo as registry } from '../repositories/account-connections.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { claimIdentity, disconnectAccount } from './accounts.service.js';
import { seal, unseal, tokenProtectionReady } from './token-protection.js';
import { normalizeIdentity } from '../domain/account-identity.js';
import { OAuthFailure, authorizationFailure } from './oauth-diagnostics.js';

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
  if (!browser) throw new OAuthFailure('session_validation', 'missing_cookie', 'The authorization browser cookie is missing. Open Command Center using the callback hostname and start again in the same browser.');
  const row = registry.findSession(hash(browser)) as any;
  if (!row || (accountId && row.account_id !== accountId))
    throw new OAuthFailure('session_validation', 'session_expired', 'Authorization session expired; start again in the same browser.');
  const account = accountsRepo.getAccountById(row.account_id) as any;
  if (
    !account ||
    account.archived_at ||
    account.connection_revision !== row.revision
  )
    throw new OAuthFailure('session_validation', 'account_changed', 'Account connection changed; start authorization again.');
  return { row, account };
}
async function jsonFetch(url: string, options: RequestInit = {}) {
  let response: Response;
  try { response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  }); } catch (e: any) {
    const reason = e?.name === 'TimeoutError' ? 'network_timeout' : 'network_failure';
    throw new OAuthFailure('provider_response', reason, 'The server could not reach the platform token/API endpoint. Check server network connectivity, DNS and proxy configuration, then start a fresh authorization.');
  }
  let data: any;
  try { data = await response.json(); } catch {
    throw new OAuthFailure('provider_response', 'invalid_json', 'The platform returned an unreadable response.', { httpStatus: response.status });
  }
  if (!response.ok || (data.error && data.error.code !== 'ok'))
    throw new OAuthFailure('provider_response', 'provider_rejected', 'The platform rejected this request. Review the diagnostic HTTP status and numeric provider code.', {
      httpStatus: response.status,
      ...(Number.isSafeInteger(data.error?.code) ? { code: data.error.code } : {}),
      ...(Number.isSafeInteger(data.error?.error_subcode) ? { subcode: data.error.error_subcode } : {}),
    });
  return data;
}

async function metaTokenExpiry(token: any): Promise<string> {
  const now = Date.now();
  if (Number.isFinite(token.expires_in) && token.expires_in > 0)
    return new Date(now + token.expires_in * 1000).toISOString();
  // Some successful Meta exchanges omit expires_in. Verify instead of assuming
  // either expiry or validity. Never turn an unknown expiry into unlimited access.
  const result = await jsonFetch(
    `https://graph.facebook.com/${version()}/debug_token?` + new URLSearchParams({ input_token: token.access_token }),
    { headers: { Authorization: `Bearer ${process.env.META_APP_ID}|${process.env.META_APP_SECRET}` } },
  );
  const info = result.data;
  if (info?.is_valid !== true || String(info.app_id) !== process.env.META_APP_ID ||
      !Number.isSafeInteger(info.expires_at) || info.expires_at < 0)
    throw new OAuthFailure('token_validation', 'invalid_token_metadata', 'Meta did not verify token validity, app ownership and expiry. Existing credentials were preserved.');
  const expiry = info.expires_at === 0 ? now + 24 * 60 * 60 * 1000 : info.expires_at * 1000;
  const dataExpiry = Number.isSafeInteger(info.data_access_expires_at) && info.data_access_expires_at > 0
    ? info.data_access_expires_at * 1000 : Infinity;
  const effective = Math.min(expiry, dataExpiry);
  if (effective <= now)
    throw new OAuthFailure('token_validation', 'expired_token', 'Meta reports that this token or its data access has expired. Start a fresh authorization.');
  console.info('[OAuth]', JSON.stringify({ stage: 'token_validation', reason: 'verified_missing_expiry', expirySource: info.expires_at === 0 ? 'local_24h_revalidation_window' : 'meta_debug_token' }));
  return new Date(effective).toISOString();
}
function updateConnection(account: any, item: any) {
  if (!item.id || !item.accessToken)
    throw new Error('Platform returned an incomplete identity');
  if (account.external_id && String(account.external_id).trim() !== String(item.id).trim()) {
    // Only Meta's resolution of the original numeric identity can establish an
    // initial canonical Page ID. Names are neither unique nor stable.
    const knownAlias = registry.findIdentity(account.platform, `external:${item.id}`)?.account_id === account.id;
    if (account.platform !== 'facebook' || account.identity_verified_at || (!knownAlias && item.registeredId !== account.external_id))
      throw new OAuthFailure('identity_matching', 'identity_mismatch', 'Authorized account does not match the registered external ID. Select the previously verified Page.');
  }
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
  let protectedTokens: { accessToken: string; refreshToken: string | null };
  try {
    protectedTokens = { accessToken: seal(item.accessToken), refreshToken: item.refreshToken ? seal(item.refreshToken) : null };
  } catch {
    throw new OAuthFailure('token_encryption', 'encryption_failed', 'The server could not encrypt the new credentials. Check the server encryption key; existing credentials were preserved.');
  }
  registry.transaction(() => {
    const owner = registry.findIdentity(account.platform, `external:${item.id}`);
    if (owner && owner.account_id !== account.id)
      throw new OAuthFailure('identity_matching', 'duplicate_identity', 'This authorized identity belongs to another registered account, including archived accounts.');
    claimIdentity(account.platform, `external:${item.id}`, account.id);
    if (item.username)
      claimIdentity(
        account.platform,
        normalizeIdentity(account.platform, item.username).key,
        account.id
      );
    registry.saveConnection(account.id, {
      ...item,
      ...protectedTokens,
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
      ? ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content']
      : ['user.info.basic', 'user.info.profile', 'video.list'];
  if (account.platform === 'facebook' && options.publishing === true)
    scope.push('pages_manage_posts');
  if (account.platform === 'facebook' && (options.engagement === true || options.moderation === true))
    scope.push('pages_manage_engagement');
  if (account.platform === 'tiktok' && options.stats === true)
    scope.push('user.info.stats');
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
  if (account.platform === 'facebook') url.searchParams.set('auth_type', 'rerequest');
  registry.beginSession(
    {
      stateHash: hash(state),
      browserHash: hash(browserSecret),
      accountId: account.id,
      revision: account.connection_revision + 1,
      expiresAt: Date.now() + 10 * 60000,
      payload: seal(JSON.stringify({ redirectUri: redirect, requestedScopes: scope })),
    },
    hash(browser)
  );
  console.info('[OAuth]', JSON.stringify({ stage: 'authorization_started', platform: account.platform, redirectUri: redirect, requestedScopes: scope }));
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
  let stage = 'session_validation';
  let validated = false;
  try {
    const { row, account } = pending(browser);
    current = account;
    if (
      account.platform !== platform ||
      hash(String(query.state || '')) !== row.state_hash ||
      row.phase !== 'started'
    )
      throw new OAuthFailure('state_validation', 'invalid_state', 'Invalid or replayed authorization state. Start a fresh authorization.');
    validated = true;
    registry.exchanging(row.state_hash);
    stage = 'session_configuration';
    const request = row.payload ? JSON.parse(unseal(row.payload)!) : null;
    const redirectUri = process.env[account.platform === 'facebook' ? 'META_REDIRECT_URI' : 'TIKTOK_REDIRECT_URI'];
    if (!request || request.redirectUri !== redirectUri)
      throw new OAuthFailure(stage, 'configuration_changed', 'The callback configuration changed during authorization. Start a fresh authorization with the configured callback.');
    stage = 'meta_consent';
    if (query.error || !query.code)
      throw new OAuthFailure(stage, query.error === 'access_denied' ? 'access_denied' : 'missing_code', 'Meta denied or cancelled authorization, or returned no authorization code. Start again and review the consent screen.');
    const code = String(query.code);
    let items: any[] = [];
    if (account.platform === 'facebook') {
      stage = 'code_exchange';
      const params = new URLSearchParams({
        client_id: process.env.META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: request.redirectUri,
        code,
      });
      const token = await jsonFetch(
        `https://graph.facebook.com/${version()}/oauth/access_token`,
        { method: 'POST', body: params }
      );
      if (typeof token.access_token !== 'string' || !token.access_token)
        throw new OAuthFailure(stage, 'missing_access_token', 'Meta returned no access token. Existing credentials were preserved.');
      console.info('[OAuth]', JSON.stringify({ stage, tokenReturned: true, expiryReturned: Number.isFinite(token.expires_in) && token.expires_in > 0 }));
      try {
        stage = 'long_lived_exchange';
        const longLived = await jsonFetch(
          `https://graph.facebook.com/${version()}/oauth/access_token?` +
            new URLSearchParams({
              grant_type: 'fb_exchange_token',
              client_id: process.env.META_APP_ID!,
              client_secret: process.env.META_APP_SECRET!,
              fb_exchange_token: token.access_token,
            })
        );
        if (longLived?.access_token) {
          token.access_token = longLived.access_token;
          token.expires_in = longLived.expires_in;
        }
      } catch (e) { authorizationFailure(e, stage); }
      stage = 'token_validation';
      const expiresAt = await metaTokenExpiry(token);
      const headers = { Authorization: `Bearer ${token.access_token}` };
      stage = 'scope_validation';
      const permissions = await jsonFetch(
        `https://graph.facebook.com/${version()}/me/permissions`,
        { headers }
      );
      const scopes = (permissions.data || [])
        .filter((p: any) => p.status === 'granted')
        .map((p: any) => p.permission);
      if (!scopes.includes('pages_show_list'))
        throw new OAuthFailure(stage, 'missing_page_discovery_scope', 'Meta did not grant pages_show_list, which is required to discover Pages.');
      const missing = ['pages_manage_posts', 'pages_manage_engagement'].filter(s => request.requestedScopes.includes(s) && !scopes.includes(s));
      console.info('[OAuth]', JSON.stringify({ stage, platform: 'facebook', pagesManagePostsGranted: scopes.includes('pages_manage_posts'), pagesManageEngagementGranted: scopes.includes('pages_manage_engagement') }));
      if (missing.length)
        throw new OAuthFailure(stage, 'requested_scope_not_granted', `Meta did not grant ${missing.join(', ')}. Requesting a permission does not grant it. Review consent and the app\u2019s access to these permissions before reconnecting.`);
      let after = '';
      stage = 'page_discovery';
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
                ? (!page.tasks || !page.tasks.length || page.tasks.some((t: string) =>
                    [
                      'CREATE_CONTENT',
                      'MANAGE',
                      'PROFILE_PLUS_CREATE_CONTENT',
                      'PROFILE_PLUS_FULL_CONTROL',
                      'PROFILE_PLUS_MANAGE',
                    ].includes(t)
                  ))
                : s === 'pages_manage_engagement'
                  ? (!page.tasks || !page.tasks.length || page.tasks.some((t: string) =>
                      [
                        'MODERATE',
                        'MANAGE',
                        'PROFILE_PLUS_MODERATE',
                        'PROFILE_PLUS_FULL_CONTROL',
                        'PROFILE_PLUS_MANAGE',
                      ].includes(t)
                    ))
                  : true
            ),
            expiresAt,
          }))
        );
        after = pages.paging?.next ? pages.paging?.cursors?.after : '';
        if (items.length > 10000)
          throw new Error(
            'Too many Pages to select; narrow developer app access'
          );
      } while (after);
      if (!items.length)
        throw new OAuthFailure(stage, 'no_pages',
          'No manageable Pages returned; review Page roles and app access'
        );
      const matchesRegisteredPage = (item: any) => item.id === account.external_id ||
        (!account.identity_verified_at && registry.findIdentity('facebook', `external:${item.id}`)?.account_id === account.id);
      if (account.external_id && !items.some(matchesRegisteredPage)) {
        stage = 'identity_matching';
        if (!account.identity_verified_at && /^\d+$/.test(account.external_id)) {
          const canonical = await jsonFetch(`https://graph.facebook.com/${version()}/${account.external_id}?fields=id`, { headers });
          const match = items.find(i => i.id === canonical.id);
          if (match) match.registeredId = account.external_id;
        }
        if (!items.some(i => matchesRegisteredPage(i) || i.registeredId === account.external_id))
          throw new OAuthFailure(stage, 'existing_page_not_returned', 'Meta did not return the registered or previously verified Page. Reconnect and include that Page in consent.');
      }
    } else {
      stage = 'code_exchange';
      const token = await jsonFetch(
        'https://open.tiktokapis.com/v2/oauth/token/',
        {
          method: 'POST',
          body: new URLSearchParams({
            client_key: process.env.TIKTOK_CLIENT_KEY!,
            client_secret: process.env.TIKTOK_CLIENT_SECRET!,
            grant_type: 'authorization_code',
            redirect_uri: request.redirectUri,
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
    stage = 'candidate_encryption';
    registry.saveCandidates(row.state_hash, seal(JSON.stringify(items)));
    return account.id;
  } catch (e: any) {
    const failure = authorizationFailure(e, stage);
    if (current && validated) {
      const a = accountsRepo.getAccountById(current.id) as any;
      if (a?.connection_revision === current.connection_revision) {
        registry.connectionStatus(
          current.id,
          'connection_error',
          failure.message
        );
        registry.clearSessions(current.id);
      }
    }
    throw failure;
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
  try {
    const { row, account } = pending(browser, id);
    if (row.phase !== 'selecting')
      throw new OAuthFailure('identity_selection', 'not_selecting', 'Complete official authorization first.');
    const item = JSON.parse(unseal(row.payload)!).find(
      (i: any) => i.id === input.externalId
    );
    if (!item || input.confirmIdentity !== true)
      throw new OAuthFailure('identity_selection', 'confirmation_required', 'Confirm that this identity is the registered account.');
    updateConnection(account, item);
    console.info('[OAuth]', JSON.stringify({ stage: 'connection_finalization', reason: 'connected', platform: account.platform }));
  } catch (e) { throw authorizationFailure(e, 'connection_finalization'); }
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
