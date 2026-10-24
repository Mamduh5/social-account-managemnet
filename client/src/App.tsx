import React, { useState, useEffect } from 'react';
import { api } from './api/client';
import { Category } from './types';
import { 
  LayoutDashboard, Users, Send, MessageSquare, Activity, 
  BarChart3, Sparkles, Settings, Radio, Plus, Menu, X, Sun, Moon 
} from 'lucide-react';

import { DashboardView } from './views/DashboardView';
import { AccountsView } from './views/AccountsView';
import { PublishingView } from './views/PublishingView';
import { BrandingStudioView } from './views/BrandingStudioView';
import { InboxView } from './views/InboxView';
import { ActivityView } from './views/ActivityView';
import { AnalyticsView } from './views/AnalyticsView';
import { SettingsView } from './views/SettingsView';
import { ContentAssistantView } from './views/ContentAssistantView';
import { GroupsWorkspaceView } from './views/GroupsWorkspaceView';

export function App() {
  const [activeTab, setActiveTab] = useState<string>(new URLSearchParams(window.location.search).has('connectionAccount') ? 'accounts' : 'dashboard');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [targetBrandingAccountId, setTargetBrandingAccountId] = useState<string | undefined>(undefined);
  const [sseConnected, setSseConnected] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Warm theme state: 'dark' (Warm Charcoal) or 'light' (Cozy Linen)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('scc-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('scc-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

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
    { id: 'assistant', label: 'Content Assistant', icon: Sparkles },
    { id: 'groups', label: 'Groups Planning', icon: Users },
    { id: 'branding', label: 'Branding Studio', icon: Sparkles },
    { id: 'inbox', label: 'Engagement Inbox', icon: MessageSquare },
    { id: 'activity', label: 'Activity Feed', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Bridge', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-slate-100 flex flex-col md:flex-row overflow-x-hidden selection:bg-terracotta-500/30 selection:text-terracotta-200">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-surface border-r border-border shrink-0 flex flex-col justify-between">
        <div>
          {/* Brand Logo Header */}
          <div className="p-4 md:p-5 border-b border-border/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-terracotta-500 via-honey-500 to-terracotta-600 flex items-center justify-center text-white shadow-md shadow-terracotta-500/25">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div>
                <h1 className="font-extrabold text-sm tracking-tight text-slate-100 leading-tight">
                  Social Command
                </h1>
                <p className="text-[10px] text-terracotta-400 font-semibold tracking-wider uppercase">
                  Creative Studio
                </p>
              </div>
            </div>

            {/* Mobile Controls: Theme + Hamburger */}
            <div className="flex items-center gap-1.5 md:hidden">
              <button
                onClick={toggleTheme}
                aria-label="Toggle studio theme"
                className="p-2 rounded-lg bg-surface-card border border-border text-slate-400 hover:text-slate-100"
                title={theme === 'dark' ? 'Switch to Warm Linen' : 'Switch to Warm Charcoal'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-honey-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                className="p-2 rounded-lg bg-surface-card border border-border text-slate-300 hover:text-white"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-terracotta-600 text-white shadow-md shadow-terracotta-600/25 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-surface-hover'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer info & Desktop Theme Toggle */}
        <div className={`p-3.5 m-3 rounded-2xl bg-surface-card border border-border/80 text-[11px] space-y-2.5 ${mobileMenuOpen ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Studio Theme</span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border text-[10px] font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3 h-3 text-honey-400" />
                  <span>Warm Dark</span>
                </>
              ) : (
                <>
                  <Moon className="w-3 h-3 text-slate-600" />
                  <span>Cozy Light</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Environment</span>
            <span className="text-[10px] font-bold uppercase text-sage-400 bg-sage-500/10 border border-sage-500/20 px-1.5 py-0.5 rounded">
              Self-Hosted
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500">
            <span>Timezone</span>
            <span className="text-slate-300 font-mono text-[10px]">Asia/Bangkok</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-surface/85 backdrop-blur-md border-b border-border px-3 sm:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Global Content Category Selector */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs min-w-0">
              <span className="text-slate-400 font-medium hidden sm:inline shrink-0">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-surface text-slate-100 border border-border hover:border-slate-600 rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-terracotta-500 cursor-pointer max-w-[155px] sm:max-w-none truncate"
              >
                <option value="all">All Production Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live SSE indicator */}
            <div className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1 rounded-full bg-surface border border-border">
              <Radio className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${sseConnected ? 'text-sage-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-[10px] sm:text-[11px] text-slate-300 font-medium">
                {sseConnected ? 'Live' : 'Syncing'}
              </span>
            </div>

            {/* Quick Action Button: New Post */}
            <button
              onClick={() => setActiveTab('publishing')}
              className="px-2.5 sm:px-3.5 py-1.5 bg-terracotta-600 hover:bg-terracotta-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm shadow-terracotta-600/25 active:scale-95 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">New Post</span>
              <span className="xs:hidden">Post</span>
            </button>
          </div>
        </header>

        {/* View Router */}
        <main className="flex-1 p-3.5 sm:p-6 overflow-y-auto overflow-x-hidden">
          {activeTab === 'dashboard' && (
            <DashboardView onNavigate={(tab) => setActiveTab(tab)} selectedCategory={selectedCategory} />
          )}
          {activeTab === 'accounts' && (
            <AccountsView 
              onNavigateToBranding={handleNavigateToBranding}
              onPreparePublication={(id) => { sessionStorage.setItem('prepareAccountId', id); setActiveTab('publishing'); }}
              selectedCategory={selectedCategory} 
            />
          )}
          {activeTab === 'publishing' && (
            <PublishingView selectedCategory={selectedCategory} />
          )}
          {activeTab === 'assistant' && <ContentAssistantView />}
          {activeTab === 'groups' && <GroupsWorkspaceView />}
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
