/**
 * Design Tokens & Styling Helpers
 * Provides semantic color maps, badge styles, and layout tokens.
 * The next UI/UX agent can adjust these tokens to transition into a cozy, welcoming aesthetic
 * without modifying component logic or business workflows.
 */

export const themeTokens = {
  // Surface & Border Palette
  surfaces: {
    appBg: 'bg-background',
    card: 'bg-surface-card',
    surface: 'bg-surface',
    border: 'border-border',
    borderLight: 'border-border/80',
    borderHighlight: 'border-indigo-500/30',
  },

  // Interactive Accents
  accents: {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    primaryShadow: 'shadow-md shadow-indigo-600/30',
    secondary: 'bg-surface hover:bg-slate-800 text-slate-200 border border-slate-700',
    ghost: 'hover:bg-slate-800 text-slate-400 hover:text-slate-200',
    danger: 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40',
    warning: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40',
  },

  // Platform Branding
  platforms: {
    facebook: {
      badge: 'bg-blue-600/20 text-blue-400 border border-blue-500/30',
      text: 'text-blue-400',
      label: 'Facebook',
    },
    tiktok: {
      badge: 'bg-rose-600/20 text-rose-400 border border-rose-500/30',
      text: 'text-rose-400',
      label: 'TikTok',
    },
  },

  // Status Colors
  statuses: {
    connected: {
      badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
    },
    expired: {
      badge: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
    },
    failed: {
      badge: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
      dot: 'bg-rose-400',
      text: 'text-rose-400',
    },
    preparing: {
      badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      dot: 'bg-blue-400',
      text: 'text-blue-400',
    },
    branding: {
      badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
      dot: 'bg-purple-400',
      text: 'text-purple-400',
    },
    uploading: {
      badge: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
      dot: 'bg-indigo-400',
      text: 'text-indigo-400',
    },
    published: {
      badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
    },
    scheduled: {
      badge: 'bg-slate-700 text-slate-300 border border-slate-600',
      dot: 'bg-slate-400',
      text: 'text-slate-300',
    },
    awaiting_confirmation: {
      badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
    },
  },

  // Safe Areas for 9:16 Video Canvas Simulation
  safeAreas: {
    tiktok: {
      top: 120,
      bottom: 280,
      left: 40,
      right: 80,
    },
  },
};
