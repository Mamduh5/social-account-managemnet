import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Account } from '../types';
import { 
  Settings, Folder, Globe, Compass, 
  Save, Database 
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
      <div className="bg-surface-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-terracotta-400 flex items-center gap-1">
            <Settings className="w-3.5 h-3.5" /> Workspace Configuration
          </span>
        </div>
        <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
          <span>System Settings & Integration Bridges</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure local pipeline integrations, Browser Bridge profiles, and API connection credentials
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. AI Video Pipeline Watch Directory */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-4 text-xs shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Folder className="w-4 h-4 text-terracotta-400" />
              <span>AI Video Pipeline Ingestion</span>
            </h3>
            <span className="text-[10px] bg-terracotta-500/15 text-terracotta-300 border border-terracotta-500/25 px-2 py-0.5 rounded-md font-mono">
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
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-terracotta-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">
                {pipelineFiles.length} MP4 videos currently discovered
              </span>
              <button
                type="submit"
                disabled={savingDir}
                className="scc-btn-primary"
              >
                <Save className="w-3.5 h-3.5" />
                {savingDir ? 'Saving...' : dirSaveSuccess ? 'Updated ✓' : 'Save Path'}
              </button>
            </div>
          </form>

          {/* Webhook endpoint contract info */}
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="font-semibold text-slate-200">Pipeline Webhook Ingest Endpoint</p>
            <div className="p-3 bg-surface rounded-xl font-mono text-[11px] text-terracotta-300 select-all border border-border">
              POST http://localhost:3001/api/pipeline/webhook
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upstream pipeline jobs can send a JSON payload with <code className="text-slate-300 font-mono bg-surface px-1 py-0.5 rounded border border-border">jobId</code> and <code className="text-slate-300 font-mono bg-surface px-1 py-0.5 rounded border border-border">finalVideoPath</code> to automatically import into Social Command Center.
            </p>
          </div>
        </div>

        {/* 2. Browser Bridge Management */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-4 text-xs shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Compass className="w-4 h-4 text-terracotta-400" />
              <span>Browser Bridge (Playwright / Chromium)</span>
            </h3>
            <span className="text-[10px] bg-sage-500/15 text-sage-300 border border-sage-500/25 px-2 py-0.5 rounded-md font-mono">
              Assisted Mode Ready
            </span>
          </div>

          <p className="text-slate-400">
            Launch persistent, authenticated browser sessions for each account without relying on platform API permissions.
          </p>

          {bridgeMessage && (
            <div className="p-3 bg-terracotta-500/15 border border-terracotta-500/30 rounded-xl text-terracotta-300 text-xs">
              {bridgeMessage}
            </div>
          )}

          <div className="space-y-2.5">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-3 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-slate-100 truncate">{acc.name}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{acc.handle} • {acc.platform}</p>
                </div>

                <button
                  onClick={() => handleLaunchBrowserSession(acc.id)}
                  disabled={launchingAccountId === acc.id}
                  className="scc-btn-secondary text-xs shrink-0"
                >
                  <Compass className="w-3.5 h-3.5 text-terracotta-400" />
                  {launchingAccountId === acc.id ? 'Launching...' : 'Open Session'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Operational Timezone and Persistence */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-3 text-xs shadow-xs">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-terracotta-400" />
            <span>Timezone & Scheduling Environment</span>
          </h3>

          <div className="p-3.5 bg-surface rounded-xl border border-border space-y-1.5">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Operating Timezone:</span>
              <strong className="text-slate-100 font-mono">Asia/Bangkok (UTC+7)</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Current Server Time:</span>
              <strong className="text-terracotta-400 font-mono">{new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })}</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Restart Recovery:</span>
              <strong className="text-sage-400 font-semibold">Enabled (Automatic Queue Lease Reset)</strong>
            </div>
          </div>
        </div>

        {/* 4. Local Database Persistence */}
        <div className="bg-surface-card border border-border rounded-2xl p-5 space-y-3 text-xs shadow-xs">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-terracotta-400" />
            <span>Database Storage & Backups</span>
          </h3>

          <div className="p-3.5 bg-surface rounded-xl border border-border space-y-1.5">
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Database Engine:</span>
              <strong className="text-slate-100">SQLite (better-sqlite3, WAL mode)</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Database File:</span>
              <strong className="text-slate-300 font-mono">.data/social_command_center.db</strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="text-slate-400">Renders Directory:</span>
              <strong className="text-slate-300 font-mono">.data/renders/</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
