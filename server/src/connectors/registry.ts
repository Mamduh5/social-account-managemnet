import { AccountConnector } from './types.js';
import { SimulatorConnector } from './simulator.js';
import { MetaFacebookConnector } from './meta-facebook.js';
import { TikTokConnector } from './tiktok.js';
import { BrowserBridgeConnector } from './browser-bridge.js';

const simulator = new SimulatorConnector();
const metaConnector = new MetaFacebookConnector();
const tiktokConnector = new TikTokConnector();
const bridgeConnector = new BrowserBridgeConnector();

export function getConnector(account: any): AccountConnector {
  if (account.connector_mode === 'simulator') {
    return simulator;
  }

  if (account.connector_mode === 'browser_bridge') {
    return bridgeConnector;
  }

  if (account.connector_mode === 'official_api') {
    if (account.platform === 'facebook') {
      return metaConnector;
    }
    if (account.platform === 'tiktok') {
      return tiktokConnector;
    }
  }

  // Fallback to simulator
  return simulator;
}

export { simulator, metaConnector, tiktokConnector, bridgeConnector };
