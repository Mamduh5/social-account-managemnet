import React, { useState, useEffect } from 'react';
import { api } from './api/client';
import { Category } from './types';
import { 
  LayoutDashboard, Users, Send, MessageSquare, Activity, 
  BarChart3, Sparkles, Settings, Globe, Radio, Plus, Film, Menu, X 
} from 'lucide-react';

import { DashboardView } from './views/DashboardView';
import { AccountsView } from './views/AccountsView';
import { PublishingView } from './views/PublishingView';
import { BrandingStudioView } from './views/BrandingStudioView';
import { InboxView } from './views/InboxView';
import { ActivityView } from './views/ActivityView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [targetBrandingAccountId, setTargetBrandingAccountId] = useState<string | undefined>(undefined);
  const [sseConnected, setSseConnected] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.getCategories().then((res) => {
      setCategories(res.categories || []);
    });

    // Connect to Server-Sent Events for real-time progress & notifications
    const eventSource = new EventSource('/api/events');
    eventSource.onopen = () => setSseConnected(true);
    eventSource.onerror = () => setSseConnected(false);

    return () => {
      eventSource.close();
    };
  }, []);

  const handleNavigateToBranding = (accountId: string) => {
    setTargetBrandingAccountId(accountId);
    setActiveTab('branding');
    setMobileMenuOpen(false);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Accounts & Categories', icon: Users },
    { id: 'publishing', label: 'Publishing Center', icon: Send },
    { id: 'branding', label: 'Branding Studio', icon: Sparkles },
    { id: 'inbox', label: 'Engagement Inbox', icon: MessageSquare },
    { id: 'activity', label: 'Activity Feed', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Bridge', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-surface border-r border-border shrink-0 flex flex-col justify-between">
        <div>
          {/* Brand Logo Header */}
          <div className="p-4 md:p-5 border-b border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-extrabold text-sm tracking-tight text-white leading-tight">
                  Social Command
                </h1>
                <p className="text-[10px] text-indigo-400 font-semibold tracking-wider uppercase">
                  Multi-Account Hub
                </p>
              </div>
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="md:hidden p-2 rounded-lg bg-surface-card border border-border text-slate-300 hover:text-white"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Nav List - Always visible on desktop, toggleable on mobile */}
          <nav className={`p-3 space-y-1 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div className={`p-4 m-3 rounded-xl bg-surface-card border border-border/80 text-[11px] space-y-2 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Environment</span>
            <span className="text-[10px] font-bold uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              Self-Hosted
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Timezone</span>
            <span className="text-slate-300 font-mono">Asia/Bangkok</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-surface/80 backdrop-blur-md border-b border-border px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            {/* Global Content Category Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-medium">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-surface text-white border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="all">All Production Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live SSE indicator */}
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-border">
              <Radio className={`w-3.5 h-3.5 ${sseConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-[11px] text-slate-300 font-medium">
                {sseConnected ? 'Live' : 'Syncing'}
              </span>
            </div>

            {/* Quick Action Button: New Post */}
            <button
              onClick={() => setActiveTab('publishing')}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> New Post
            </button>
          </div>
        </header>

        {/* View Router */}
        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView onNavigate={(tab) => setActiveTab(tab)} selectedCategory={selectedCategory} />
          )}
          {activeTab === 'accounts' && (
            <AccountsView 
              onNavigateToBranding={handleNavigateToBranding} 
              selectedCategory={selectedCategory} 
            />
          )}
          {activeTab === 'publishing' && (
            <PublishingView selectedCategory={selectedCategory} />
          )}
          {activeTab === 'branding' && (
            <BrandingStudioView 
              initialAccountId={targetBrandingAccountId} 
              selectedCategory={selectedCategory} 
            />
          )}
          {activeTab === 'inbox' && (
            <InboxView selectedCategory={selectedCategory} />
          )}
          {activeTab === 'activity' && (
            <ActivityView />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsView />
          )}
          {activeTab === 'settings' && (
            <SettingsView />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
