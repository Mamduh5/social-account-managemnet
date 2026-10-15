import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Account } from '../types';
import { 
  Settings, Folder, Globe, Compass, Shield, 
  CheckCircle2, RefreshCw, Save, ExternalLink, Database 
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [watchDir, setWatchDir] = useState('');
  const [pipelineFiles, setPipelineFiles] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [savingDir, setSavingDir] = useState(false);
  const [dirSaveSuccess, setDirSaveSuccess] = useState(false);
  const [launchingAccountId, setLaunchingAccountId] = useState<string | null>(null);
  const [bridgeMessage, setBridgeMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [pipeRes, accRes] = await Promise.all([
        api.getPipelineStatus(),
        api.getAccounts(),
      ]);
      setWatchDir(pipeRes.watchDir || '');
      setPipelineFiles(pipeRes.files || []);
      setAccounts(accRes.accounts || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveWatchDir = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDir(true);
    try {
      await api.updateWatchDir(watchDir);
      setDirSaveSuccess(true);
      setTimeout(() => setDirSaveSuccess(false), 3000);
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingDir(false);
    }
  };

  const handleLaunchBrowserSession = async (accId: string) => {
    setLaunchingAccountId(accId);
    setBridgeMessage(null);
    try {
      const res = await api.launchBrowserSession(accId);
      setBridgeMessage(res.message);
    } catch (err: any) {
      setBridgeMessage(`Failed to launch browser: ${err.message}`);
    } finally {
      setLaunchingAccountId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface-card p-5 rounded-xl border border-border">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" />
          <span>System Settings & Integration Bridges</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure local pipeline integrations, Browser Bridge profiles, and API connection credentials
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. AI Video Pipeline Watch Directory */}
        <div className="bg-surface-card border border-border rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Folder className="w-4 h-4 text-indigo-400" />
              <span>AI Video Pipeline Ingestion</span>
            </h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-mono">
              Watched Folder
            </span>
          </div>

          <p className="text-slate-400">
            Path on your machine where your upstream Flow & Gemini pipeline exports completed MP4 videos.
          </p>

          <form onSubmit={handleSaveWatchDir} className="space-y-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Local Directory Path</label>
              <input
                type="text"
                value={watchDir}
                onChange={(e) => setWatchDir(e.target.value)}
                placeholder="D:\Mamduh\Personal\ai-video-pipeline\.tmp-live-validation"
                className="w-full bg-surface border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[11px]">
                {pipelineFiles.length} MP4 videos currently discovered
              </span>
              <button
                type="submit"
                disabled={savingDir}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {savingDir ? 'Saving...' : dirSaveSuccess ? 'Updated ✓' : 'Save Path'}
              </button>
            </div>
          </form>

          {/* Webhook endpoint contract info */}
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <p className="font-semibold text-slate-300">Pipeline Webhook Ingest Endpoint</p>
            <div className="p-2.5 bg-slate-900 rounded font-mono text-[11px] text-indigo-300 select-all border border-slate-800">
              POST http://localhost:3001/api/pipeline/webhook
            </div>
            <p className="text-[11px] text-slate-500">
              Upstream pipeline jobs can send a JSON payload with <code className="text-slate-400 font-mono">jobId</code> and <code className="text-slate-400 font-mono">finalVideoPath</code> to automatically import into Social Command Center.
            </p>
          </div>
        </div>

        {/* 2. Browser Bridge Management */}
        <div className="bg-surface-card border border-border rounded-xl p-5 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>Browser Bridge (Playwright / Chromium)</span>
            </h3>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded font-mono">
              Assisted Mode Ready
            </span>
          </div>

          <p className="text-slate-400">
            Launch persistent, authenticated browser sessions for each account without relying on platform API permissions.
          </p>

          {bridgeMessage && (
            <div className="p-3 bg-indigo-950/40 border border-indigo-900 rounded text-indigo-300 text-xs">
              {bridgeMessage}
            </div>
          )}

          <div className="space-y-2.5">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-2.5 bg-surface rounded-lg border border-border flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{acc.name}</p>
                  <p className="text-[10px] text-slate-400">{acc.handle} • {acc.platform}</p>
                </div>

                <button
                  onClick={() => handleLaunchBrowserSession(acc.id)}
                  disabled={launchingAccountId === acc.id}
                  className="px-3 py-1 bg-surface hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 text-indigo-400" />
                  {launchingAccountId === acc.id ? 'Launching...' : 'Open Session'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Operational Timezone and Persistence */}
        <div className="bg-surface-card border border-border rounded-xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>Timezone & Scheduling Environment</span>
          </h3>

          <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>Operating Timezone:</span>
              <strong className="text-white font-mono">Asia/Bangkok (UTC+7)</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Current Server Time:</span>
              <strong className="text-indigo-400 font-mono">{new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Restart Recovery:</span>
              <strong className="text-emerald-400">Enabled (Automatic Queue Lease Reset)</strong>
            </div>
          </div>
        </div>

        {/* 4. Local Database Persistence */}
        <div className="bg-surface-card border border-border rounded-xl p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Database Storage & Backups</span>
          </h3>

          <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>Database Engine:</span>
              <strong className="text-white">SQLite (better-sqlite3, WAL mode)</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Database File:</span>
              <strong className="text-slate-400 font-mono">.data/social_command_center.db</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Renders Directory:</span>
              <strong className="text-slate-400 font-mono">.data/renders/</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
