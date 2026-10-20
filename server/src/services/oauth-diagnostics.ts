import { randomUUID } from 'node:crypto';

/** OAuth diagnostics are allowlisted. Never include provider messages, URLs, query,
 * state (even hashed), codes, cookies, token bodies or arbitrary exception text. */
export class OAuthFailure extends Error {
  constructor(
    public stage: string,
    public reason: string,
    message: string,
    public provider: { httpStatus?: number; code?: number; subcode?: number } = {},
  ) { super(message); }
}

export function authorizationFailure(error: unknown, stage: string) {
  const failure = error instanceof OAuthFailure
    ? error.stage === 'provider_response' ? new OAuthFailure(stage, error.reason, error.message, error.provider) : error
    : new OAuthFailure(
    stage, 'stage_failed', 'This authorization step failed. Start a fresh authorization; existing credentials have been preserved.',
  );
  const reference = randomUUID();
  console.warn('[OAuth]', JSON.stringify({ reference, stage: failure.stage, reason: failure.reason, ...failure.provider }));
  const codes = [failure.provider.httpStatus && `HTTP ${failure.provider.httpStatus}`, failure.provider.code !== undefined && `provider code ${failure.provider.code}`, failure.provider.subcode !== undefined && `subcode ${failure.provider.subcode}`].filter(Boolean).join(', ');
  return new OAuthFailure(failure.stage, failure.reason,
    `Authorization could not be completed at ${failure.stage}: ${failure.message}${codes ? ` (${codes})` : ''} Reference: ${reference}.`, failure.provider);
}
