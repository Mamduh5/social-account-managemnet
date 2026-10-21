import { randomUUID } from 'node:crypto';

const providerErrorCodes = new Set([
  'access_denied', 'invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope',
  'unauthorized_client', 'unsupported_grant_type', 'unsupported_response_type',
  'server_error', 'temporarily_unavailable', 'access_token_invalid', 'access_token_expired',
  'invalid_token', 'internal_error', 'invalid_params', 'rate_limit_exceeded',
  'scope_not_authorized', 'scope_permission_missed',
]);

export function safeProviderDiagnostics(provider: OAuthFailure['provider'] = {}): OAuthFailure['provider'] {
  const safeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
  return {
    ...(safeInteger(provider.httpStatus) && provider.httpStatus >= 100 && provider.httpStatus <= 599 ? { httpStatus: provider.httpStatus } : {}),
    ...((safeInteger(provider.code) || (typeof provider.code === 'string' && providerErrorCodes.has(provider.code))) ? { code: provider.code } : {}),
    ...(safeInteger(provider.subcode) ? { subcode: provider.subcode } : {}),
    // A provider-controlled log ID can contain arbitrary data. Keep the local
    // generated reference instead of reflecting it in logs or public responses.
  };
}

/** OAuth diagnostics are allowlisted. Never include provider messages, URLs, query,
 * state (even hashed), codes, cookies, token bodies or arbitrary exception text. */
export class OAuthFailure extends Error {
  constructor(
    public stage: string,
    public reason: string,
    message: string,
    public provider: { httpStatus?: number; code?: number | string; subcode?: number; logId?: string } = {},
  ) { super(message); }
}

export function authorizationFailure(error: unknown, stage: string) {
  const original = error instanceof OAuthFailure
    ? error.stage === 'provider_response' ? new OAuthFailure(stage, error.reason, error.message, error.provider) : error
    : new OAuthFailure(
    stage, 'stage_failed', 'This authorization step failed. Start a fresh authorization; existing credentials have been preserved.',
  );
  const failure = new OAuthFailure(original.stage, original.reason, original.reason === 'provider_rejected'
    ? 'The platform rejected this authorization request. Review developer-app configuration, permissions and provider availability.'
    : original.message, safeProviderDiagnostics(original.provider));
  const reference = randomUUID();
  console.warn('[OAuth]', JSON.stringify({ reference, stage: failure.stage, reason: failure.reason, ...failure.provider }));
  const codes = [
    failure.provider.httpStatus && `HTTP ${failure.provider.httpStatus}`,
    failure.provider.code !== undefined && `code: ${failure.provider.code}`,
    failure.provider.subcode !== undefined && `subcode ${failure.provider.subcode}`,
  ].filter(Boolean).join(', ');
  return new OAuthFailure(failure.stage, failure.reason,
    `Authorization could not be completed at ${failure.stage}: ${failure.message}${codes ? ` (${codes})` : ''} Reference: ${reference}.`, failure.provider);
}
