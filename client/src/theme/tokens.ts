/**
 * Design Tokens & Styling Helpers
 * Cozy Creative Studio Design System
 * Warm ivory, soft coffee, muted sage, honey amber, and restrained terracotta.
 */

export const themeTokens = {
  // Surface & Border Palette
  surfaces: {
    appBg: 'bg-background',
    card: 'bg-surface-card',
    surface: 'bg-surface',
    surfaceHover: 'bg-surface-hover',
    border: 'border-border',
    borderLight: 'border-border/60',
    borderHighlight: 'border-terracotta-500/40',
  },

  // Interactive Accents
  accents: {
    primary: 'bg-terracotta-600 hover:bg-terracotta-500 text-white shadow-sm shadow-terracotta-600/25 active:scale-[0.98]',
    primaryShadow: 'shadow-md shadow-terracotta-600/20',
    secondary: 'bg-surface hover:bg-surface-hover text-slate-200 border border-border active:scale-[0.98]',
    ghost: 'hover:bg-surface-hover active:bg-surface-hover text-slate-400 hover:text-slate-100 active:scale-[0.98]',
    danger: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 active:scale-[0.98]',
    warning: 'bg-honey-500/15 hover:bg-honey-500/25 text-honey-400 border border-honey-500/30 active:scale-[0.98]',
    success: 'bg-sage-500/15 hover:bg-sage-500/25 text-sage-400 border border-sage-500/30 active:scale-[0.98]',
  },

  // Platform Branding
  platforms: {
    facebook: {
      badge: 'bg-blue-600/15 text-blue-400 border border-blue-500/30',
      text: 'text-blue-400',
      label: 'Facebook',
    },
    tiktok: {
      badge: 'bg-rose-600/15 text-rose-400 border border-rose-500/30',
      text: 'text-rose-400',
      label: 'TikTok',
    },
  },

  // Status Colors
  statuses: {
    connected: {
      badge: 'bg-sage-500/15 text-sage-400 border border-sage-500/25',
      dot: 'bg-sage-400',
      text: 'text-sage-400',
    },
    expired: {
      badge: 'bg-honey-500/15 text-honey-400 border border-honey-500/25',
      dot: 'bg-honey-400',
      text: 'text-honey-400',
    },
    failed: {
      badge: 'bg-rose-500/15 text-rose-400 border border-rose-500/25',
      dot: 'bg-rose-400',
      text: 'text-rose-400',
    },
    preparing: {
      badge: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
      dot: 'bg-blue-400',
      text: 'text-blue-400',
    },
    branding: {
      badge: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
      dot: 'bg-purple-400',
      text: 'text-purple-400',
    },
    uploading: {
      badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
      dot: 'bg-amber-400',
      text: 'text-amber-400',
    },
    published: {
      badge: 'bg-sage-500/15 text-sage-400 border border-sage-500/25',
      dot: 'bg-sage-400',
      text: 'text-sage-400',
    },
    scheduled: {
      badge: 'bg-surface-hover text-slate-300 border border-border',
      dot: 'bg-slate-400',
      text: 'text-slate-300',
    },
    awaiting_confirmation: {
      badge: 'bg-honey-500/20 text-honey-300 border border-honey-500/30',
      dot: 'bg-honey-400',
      text: 'text-honey-300',
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
