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
  canReadPostMetrics: false,
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
      account.connection_status !== 'expired' &&
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
    capabilities.canReadPostMetrics = has('pages_read_engagement');
    capabilities.canReadComments =
      has('pages_read_engagement') && has('pages_read_user_content');
    capabilities.canPublish =
      has('pages_manage_posts') && has('pages_read_engagement');
    capabilities.canSchedule = capabilities.canPublish;
    capabilities.canReply =
      has('pages_manage_engagement') && has('pages_read_engagement');
    capabilities.canReact = capabilities.canReply;
    capabilities.canReadInsights = has('read_insights') || has('pages_read_engagement');
  }
  if (valid && account.platform === 'tiktok') {
    capabilities.canReadPostMetrics = has('video.list') || has('video.query');
    capabilities.canReadComments = has('comment.list');
    capabilities.canReply = has('comment.list.manage');
    capabilities.canReadInsights = has('data.insights');
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
        return bridgeConnector.verifyHealth(account);
      if (!valid) {
        if (
          account.platform === 'facebook' &&
          !account.is_demo &&
          !account.archived_at &&
          account.connector_mode === 'official_api' &&
          account.identity_verified_at &&
          unseal(account.access_token)
        ) {
          return adapter.verifyHealth(authorized);
        }
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
      }
      const health = await adapter.verifyHealth(authorized);
      return health;
    },
    publishPost: async (_a, payload) => {
      if (!capabilities.canPublish || account.platform !== 'facebook' || account.account_type !== 'page' || !metaConnector.publishPost) throw new Error('General posts require an authorized Facebook Page');
      return metaConnector.publishPost(authorized,payload);
    },
    publishVideo: async (_a, payload, progress) => {
      if (!capabilities.canPublish) throw new Error(blocked().errorMessage);
      return adapter.publishVideo(authorized, payload, progress);
    },
    fetchComments: async (_a, opts) =>
      capabilities.canReadComments
        ? adapter.fetchComments(authorized, opts)
        : (account.connector_mode === 'browser_bridge' ? bridgeConnector.fetchComments(account) : []),
    replyComment: async (_a, id, text) =>
      capabilities.canReply
        ? adapter.replyComment(authorized, id, text)
        : (account.connector_mode === 'browser_bridge' ? bridgeConnector.replyComment(account, id, text) : blocked()),
    verifyCommentReply: async (_a, replyId, commentId, text) =>
      capabilities.canReadComments && account.platform==='facebook'
        ? metaConnector.verifyCommentReply(authorized,replyId,commentId,text)
        : {confirmed:false,replyId},
    reactComment: async (_a, id, reaction) =>
      capabilities.canReact
        ? adapter.reactComment(authorized, id, reaction)
        : (account.connector_mode === 'browser_bridge' ? bridgeConnector.reactComment(account, id, reaction) : blocked()),
    fetchInsights: async () => (capabilities.canReadInsights ? adapter.fetchInsights(authorized) : null),
    fetchPostMetrics: async (_a, remotePostId, remotePostUrl) => {
      if (account.connector_mode === 'browser_bridge') {
        return bridgeConnector.fetchPostMetrics?.(account, remotePostId, remotePostUrl) || null;
      }
      if (!capabilities.canReadPostMetrics) {
        return {
          remotePostId,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          source: account.platform === 'facebook' ? 'meta_graph_api' : 'tiktok_display_api',
          status: 'auth_required',
          errorMessage: 'Official API authorization required (missing required scopes).',
        };
      }
      return adapter.fetchPostMetrics?.(authorized, remotePostId, remotePostUrl) || null;
    },
    fetchAccountMetrics: async (_a) => {
      if (account.connector_mode === 'browser_bridge') {
        return bridgeConnector.fetchAccountMetrics?.(account) || null;
      }
      if (!capabilities.canReadInsights && !capabilities.canReadProfile) {
        return {
          followersTotal: null,
          source: account.platform === 'facebook' ? 'meta_graph_api' : 'tiktok_display_api',
          status: 'auth_required',
          errorMessage: 'Official API authorization required.',
        };
      }
      return adapter.fetchAccountMetrics?.(authorized) || null;
    },
  };
}

export { simulator, metaConnector, tiktokConnector, bridgeConnector };
