import { randomUUID } from 'node:crypto';
import { accountConnectionsRepo as registry } from '../repositories/account-connections.repo.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import {
  normalizeIdentity,
  validateAvatar,
} from '../domain/account-identity.js';
import {
  getConnector,
  hasActiveApiAuthorization,
} from '../connectors/registry.js';

export function claimIdentity(
  platform: string,
  key: string,
  accountId: string
) {
  const row = registry.findIdentity(platform, key) as any;
  if (row && row.account_id !== accountId)
    throw new Error(
      'This platform account is already registered (including archived accounts)'
    );
  registry.claimIdentity(platform, key, accountId);
}
// Existing identities are indexed without merging or overwriting any records.
export function indexExistingIdentities() {
  for (const account of accountsRepo.getAllAccounts(true)) {
    if ((account as any).is_demo) continue;
    try {
      claimIdentity(
        account.platform,
        normalizeIdentity(
          account.platform,
          (account as any).public_url || account.handle
        ).key,
        account.id
      );
    } catch {}
    if (account.external_id) {
      try {
        claimIdentity(
          account.platform,
          `external:${account.external_id}`,
          account.id
        );
      } catch {}
    }
  }
}
export function publicAccount(account: any) {
  const { access_token, refresh_token, granted_scopes_json, ...safe } = account;
  let scopes: string[] = [];
  try {
    scopes = JSON.parse(granted_scopes_json || '[]');
  } catch {}
  let connectionStatus = account.is_demo ? 'demo' : account.connection_status;
  if (
    !account.is_demo &&
    account.token_expires_at &&
    Date.parse(account.token_expires_at) <= Date.now()
  )
    connectionStatus = 'expired';
  return {
    ...safe,
    status:
      !account.is_demo &&
      !hasActiveApiAuthorization(account) &&
      account.status === 'connected'
        ? 'disconnected'
        : safe.status,
    health_status:
      !account.is_demo &&
      !hasActiveApiAuthorization(account) &&
      account.status === 'connected'
        ? 'Authorization required; local preparation remains available'
        : safe.health_status,
    connection_status: connectionStatus,
    grantedScopes: scopes,
    capabilities: getConnector(account).getCapabilities(),
    brandKit: {
      watermarkType: 'moving_text',
      text: account.handle,
      movementPreset: 'smooth_sine',
      fontSize: 24,
      opacity: 0.85,
      safeArea: { top: 120, bottom: 280, left: 40, right: 120 },
      ...JSON.parse(account.brand_kit_json || '{}'),
    },
    settings: JSON.parse(account.settings_json || '{}'),
  };
}
export function saveRegisteredAccount(body: any, id?: string) {
  const old = id ? (accountsRepo.getAccountById(id) as any) : undefined;
  if (id && !old) throw new Error('Account not found');
  if (old?.is_demo)
    throw new Error(
      'Demo identities are read-only; register a separate real account'
    );
  const platform = old?.platform || body.platform;
  if (old && body.platform && body.platform !== old.platform)
    throw new Error('Platform cannot be changed');
  const name = String(body.name ?? old?.name ?? '').trim();
  if (!name || name.length > 150)
    throw new Error('Display name is required (maximum 150 characters)');
  const hasIdentity = body.publicUrl !== undefined || body.handle !== undefined;
  const identity = normalizeIdentity(
    platform,
    hasIdentity ? body.publicUrl || body.handle : old?.public_url || old?.handle
  );
  if (
    body.publicUrl &&
    body.handle &&
    normalizeIdentity(platform, body.handle).key !== identity.key
  )
    throw new Error('Profile URL and username identify different accounts');
  const type =
    body.accountType ??
    old?.account_type ??
    (platform === 'facebook' ? 'page' : 'personal');
  if (
    platform === 'facebook'
      ? type !== 'page'
      : !['personal', 'business'].includes(type)
  )
    throw new Error(
      'Choose a Facebook Page or TikTok Personal/Business account'
    );
  const category =
    body.categoryId !== undefined
      ? body.categoryId || null
      : old?.category_id || null;
  if (category && !accountsRepo.getCategoryById(category))
    throw new Error('Category not found');
  const avatar =
    body.avatarUrl !== undefined
      ? validateAvatar(body.avatarUrl)
      : old?.avatar_url || '';
  const description = String(body.description ?? old?.description ?? '').trim();
  const notes = String(body.notes ?? old?.notes ?? '').trim();
  if (description.length > 2000 || notes.length > 5000)
    throw new Error('Description or notes are too long');
  const external =
    String(body.externalId ?? old?.external_id ?? '').trim() ||
    identity.numericId ||
    null;
  if (
    external &&
    (external.length > 150 ||
      !/^[\w-]+$/.test(external) ||
      (platform === 'facebook' && !/^\d+$/.test(external)))
  )
    throw new Error('Invalid external account ID');
  if (identity.numericId && external && identity.numericId !== external)
    throw new Error('Page ID conflicts with the profile URL');
  if (old?.identity_verified_at && external !== old.external_id)
    throw new Error(
      'Disconnect before changing the verified external identity'
    );
  const preferences =
    body.publishingPreferences ?? JSON.parse(old?.settings_json || '{}');
  if (
    !preferences ||
    typeof preferences !== 'object' ||
    Array.isArray(preferences) ||
    Object.keys(preferences).some(
      (k) => !['defaultCaption', 'defaultHashtags', 'applyBranding'].includes(k)
    )
  )
    throw new Error('Invalid publishing preferences');
  if (
    typeof preferences.defaultCaption !== 'undefined' &&
    (typeof preferences.defaultCaption !== 'string' ||
      preferences.defaultCaption.length > 5000)
  )
    throw new Error('Invalid default caption');
  if (
    typeof preferences.defaultHashtags !== 'undefined' &&
    (typeof preferences.defaultHashtags !== 'string' ||
      preferences.defaultHashtags.length > 2000)
  )
    throw new Error('Invalid default hashtags');
  if (
    typeof preferences.applyBranding !== 'undefined' &&
    typeof preferences.applyBranding !== 'boolean'
  )
    throw new Error('Invalid branding preference');
  const accountId = id || `acc-${randomUUID()}`;
  registry.transaction(() => {
    // Claim after insertion because claims have a foreign key; transaction rolls back on duplicates.
    if (!old)
      registry.insertRegistered({
        id: accountId,
        name,
        handle: identity.handle,
        platform,
        type,
        category,
        avatar,
      });
    claimIdentity(platform, identity.key, accountId);
    if (external) claimIdentity(platform, `external:${external}`, accountId);
    const changedIdentity =
      old &&
      normalizeIdentity(platform, old.public_url || old.handle).key !==
        identity.key;
    registry.updateRegistration({
      id: accountId,
      name,
      handle: identity.handle,
      publicUrl: identity.publicUrl,
      type,
      category,
      avatar,
      description,
      notes,
      external,
      settings: JSON.stringify(preferences),
    });
    if (changedIdentity && old.identity_verified_at)
      disconnectAccount(accountId);
  });
  return accountId;
}
export function disconnectAccount(id: string) {
  registry.disconnect(id);
}
export function archiveAccount(id: string, archived = true) {
  const account = accountsRepo.getAccountById(id);
  if (!account) throw new Error('Account not found');
  registry.transaction(() => {
    disconnectAccount(id);
    registry.archive(id, archived ? new Date().toISOString() : null);
  });
}
