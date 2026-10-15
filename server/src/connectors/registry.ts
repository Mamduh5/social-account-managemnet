import { AccountConnector, ConnectorCapabilities } from './types.js';
import { SimulatorConnector } from './simulator.js';
import { MetaFacebookConnector } from './meta-facebook.js';
import { TikTokConnector } from './tiktok.js';
import { BrowserBridgeConnector } from './browser-bridge.js';
import { unseal } from '../services/token-protection.js';

const simulator = new SimulatorConnector();
const metaConnector = new MetaFacebookConnector();
const tiktokConnector = new TikTokConnector();
const bridgeConnector = new BrowserBridgeConnector();
export const emptyCapabilities: ConnectorCapabilities = {
  canReadProfile: false,
  canPublish: false,
  canSchedule: false,
  canReadComments: false,
  canReply: false,
  canReact: false,
  canReadInsights: false,
  canReceiveEvents: false,
  requiresManualConfirmation: false,
  supportedVideoFormats: ['mp4'],
  maxVideoSizeMb: 1024,
  maxDurationSeconds: 14400,
};
export function hasActiveApiAuthorization(account: any): boolean {
  try {
    return !!(
      !account.is_demo &&
      !account.archived_at &&
      account.connector_mode === 'official_api' &&
      account.identity_verified_at &&
      account.status === 'connected' &&
      unseal(account.access_token) &&
      account.token_expires_at &&
      Date.parse(account.token_expires_at) > Date.now()
    );
  } catch {
    return false;
  }
}
export function getConnector(account: any): AccountConnector {
  if (
    account.is_demo &&
    account.connector_mode === 'simulator' &&
    !account.archived_at
  )
    return simulator;
  let token: string | null = null;
  try {
    token = unseal(account.access_token);
  } catch {}
  const valid = hasActiveApiAuthorization(account);
  let scopes: string[] = [];
  try {
    scopes = JSON.parse(account.granted_scopes_json || '[]');
  } catch {}
  const has = (s: string) => scopes.includes(s);
  const capabilities = { ...emptyCapabilities, requiresManualConfirmation: true };
  capabilities.canReadProfile =
    !!valid &&
    (account.platform === 'facebook'
      ? has('pages_show_list')
      : has('user.info.basic'));
  if (valid && account.platform === 'facebook') {
    capabilities.canReadComments =
      has('pages_read_engagement') && has('pages_read_user_content');
    capabilities.canPublish =
      has('pages_manage_posts') && has('pages_read_engagement');
    capabilities.canSchedule = capabilities.canPublish;
    capabilities.canReply =
      has('pages_manage_engagement') && has('pages_read_engagement');
    capabilities.canReact = capabilities.canReply;
  }
  // TikTok Direct Post stays disabled until creator-info, privacy UX and status reconciliation are implemented.
  const adapter =
    account.platform === 'facebook' ? metaConnector : tiktokConnector;
  const authorized = { ...account, access_token: token };
  const blocked = () => ({
    success: false,
    errorMessage:
      'Operation unavailable; authorize the required scopes or use the native platform',
  });
  return {
    getCapabilities: () => ({ ...capabilities }),
    verifyHealth: async () => {
      if (account.archived_at)
        return {
          status: 'disconnected',
          healthStatus: 'Archived',
          lastCheckedAt: new Date().toISOString(),
        };
      if (account.connector_mode === 'browser_bridge')
        return {
          status: 'disconnected',
          healthStatus:
            'Browser-assisted setup; verify destination in the native interface',
          lastCheckedAt: new Date().toISOString(),
        };
      if (!valid)
        return {
          status:
            account.token_expires_at &&
            Date.parse(account.token_expires_at) <= Date.now()
              ? 'expired'
              : 'disconnected',
          healthStatus:
            'Authorization required; local preparation is available',
          lastCheckedAt: new Date().toISOString(),
        };
      const health = await adapter.verifyHealth(authorized);
      return health;
    },
    publishVideo: async (_a, payload, progress) => {
      if (!capabilities.canPublish) throw new Error(blocked().errorMessage);
      return adapter.publishVideo(authorized, payload, progress);
    },
    fetchComments: async (_a, opts) =>
      capabilities.canReadComments
        ? adapter.fetchComments(authorized, opts)
        : [],
    replyComment: async (_a, id, text) =>
      capabilities.canReply
        ? adapter.replyComment(authorized, id, text)
        : blocked(),
    reactComment: async (_a, id, reaction) =>
      capabilities.canReact
        ? adapter.reactComment(authorized, id, reaction)
        : blocked(),
    fetchInsights: async () => null,
  };
}
export { simulator, metaConnector, tiktokConnector, bridgeConnector };
