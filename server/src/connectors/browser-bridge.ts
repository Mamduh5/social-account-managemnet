import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AccountConnector, ConnectorCapabilities, ConnectionHealth, PublishDestinationPayload, PublishResult, CommentFetchResult } from './types.js';
import { dataDir } from '../db/database.js';

export class BrowserBridgeConnector implements AccountConnector {
  private profilesDir = path.resolve(dataDir, 'browser-profiles');

  constructor() {
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
  }

  getCapabilities(): ConnectorCapabilities {
    return {
      canPublish: false,
      canSchedule: false,
      canReadComments: false,
      canReply: false,
      canReact: false,
      canReadInsights: false,
      canReceiveEvents: false,
      requiresManualConfirmation: true, // Key requirement: explicit operator confirmation
      supportedVideoFormats: ['mp4', 'mov', 'webm'],
      maxVideoSizeMb: 2048,
      maxDurationSeconds: 14400,
    };
  }

  async verifyHealth(account: any): Promise<ConnectionHealth> {
    const profilePath = path.resolve(this.profilesDir, account.id);
    const now = new Date().toISOString();

    if (!fs.existsSync(profilePath)) {
      return {
        status: 'disconnected',
        healthStatus: 'Browser profile uninitialized; launch browser session to sign in',
        lastCheckedAt: now,
      };
    }

    const lockFile = path.join(profilePath, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      return {
        status: 'connected',
        healthStatus: 'Browser session active (window open in native platform)',
        lastCheckedAt: now,
      };
    }

    try {
      const { chromium } = await import('playwright');
      const context = await chromium.launchPersistentContext(profilePath, {
        headless: true,
        channel: 'chrome',
        args: ['--no-first-run'],
      });

      const urls =
        account.platform === 'facebook'
          ? ['https://www.facebook.com', 'https://business.facebook.com']
          : ['https://www.tiktok.com'];

      const cookies = await context.cookies(urls);
      await context.close();

      if (account.platform === 'facebook') {
        const cUser = cookies.find((c) => c.name === 'c_user');
        const xs = cookies.find((c) => c.name === 'xs');
        if (cUser && xs) {
          return {
            status: 'connected',
            healthStatus: `Authenticated Facebook session detected (User ID: ${cUser.value})`,
            lastCheckedAt: now,
          };
        }
        return {
          status: 'disconnected',
          healthStatus: 'Browser profile lacks active Facebook session; launch session to log in',
          lastCheckedAt: now,
        };
      } else {
        const sessionId = cookies.find(
          (c) => c.name === 'sessionid' || c.name === 'sessionid_ss'
        );
        if (sessionId) {
          return {
            status: 'connected',
            healthStatus: 'Authenticated TikTok session detected in profile',
            lastCheckedAt: now,
          };
        }
        return {
          status: 'disconnected',
          healthStatus: 'Browser profile lacks active TikTok session; launch session to log in',
          lastCheckedAt: now,
        };
      }
    } catch {
      return {
        status: 'disconnected',
        healthStatus: 'Manual browser handoff; verify destination in native interface',
        lastCheckedAt: now,
      };
    }
  }

  async launchBrowserSession(account: any): Promise<{ success: boolean; message: string }> {
    const profilePath = path.resolve(this.profilesDir, account.id);
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }

    const targetUrl =
      account.platform === 'facebook'
        ? (account.external_id
            ? `https://business.facebook.com/latest/composer?page_id=${account.external_id}`
            : 'https://business.facebook.com/latest/home')
        : 'https://www.tiktok.com/tiktokstudio/upload';

    // Launch Chrome or default browser with isolated user data dir
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\mamdu\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    const exe = chromePaths.find((p) => fs.existsSync(p)) || 'chrome';

    try {
      const child = spawn(
        exe,
        [`--user-data-dir=${profilePath}`, '--no-first-run', '--new-window', targetUrl],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();

      return {
        success: true,
        message: `Browser session opened for ${account.name} at ${targetUrl}. Please log in to save session.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to launch browser: ${err.message}`,
      };
    }
  }

  async publishVideo(
    account: any,
    payload: PublishDestinationPayload,
    onProgress?: (pct: number, stage: string) => void
  ): Promise<PublishResult> {
    if (!fs.existsSync(payload.videoPath)) {
      throw new Error(`Video file not found at path: ${payload.videoPath}`);
    }

    if (onProgress) onProgress(20, 'preparing');

    // Launch the publisher interface for operator to confirm
    const profilePath = path.resolve(this.profilesDir, account.id);
    const targetUrl =
      account.platform === 'facebook'
        ? `https://business.facebook.com/latest/composer?page_id=${account.external_id || ''}`
        : 'https://www.tiktok.com/tiktokstudio/upload';

    if (onProgress) onProgress(60, 'awaiting_confirmation');

    // We store the staged publishing package (video path + caption + hashtags) in an assisted manifest
    const manifestPath = path.resolve(dataDir, `staged-bridge-${payload.destinationId}.json`);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          accountId: account.id,
          accountName: account.name,
          platform: account.platform,
          videoPath: payload.videoPath,
          title: payload.title,
          caption: payload.caption,
          hashtags: payload.hashtags,
          scheduledAt: payload.scheduledAt,
          targetUrl,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    // Launch browser window for user to inspect & post
    // Opening the native site is an explicit operator action in the prepared package UI.

    return {
      success: true,

      verificationStatus: 'unverified', // Marked honest: awaiting operator confirmation

    };
  }

  async fetchComments(_account: any): Promise<CommentFetchResult[]> {
    return [];
  }

  async replyComment(_account: any, _commentId: string, _text: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'Browser Bridge uses Native Platform Handoff. Click the link to reply in your browser session.',
    };
  }

  async reactComment(_account: any, _commentId: string, _reaction: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'Reacting is handled in the native browser session.',
    };
  }

  async fetchInsights(_account: any): Promise<any> {
    return null;
  }
}
