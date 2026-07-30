// Design tokens — single source of truth for the Cyber-Sentry dark palette.
// Import these instead of hardcoding colour strings throughout components.

export const colors = {
  // Backgrounds
  bgBase:    "#f0efec",
  bgSurface: "#ffffff",
  bgElevated: "#f2f1ee",
  bgHover:   "#2e3249",

  // Accent / brand
  accent:    "#4f46e5",
  accentDim: "color-mix(in srgb, var(--accent) 15%, transparent)",
  accentGlow: "color-mix(in srgb, var(--accent) 8%, transparent)",

  // Text
  textPrimary:   "#1a1a18",
  textSecondary: "#6b6a65",
  textMuted:     "rgba(187,201,207,0.5)",

  // Status
  success: "#22c55e",
  warning: "#b45309",
  error:   "#c0362c",
  info:    "#3b82f6",

  // Borders
  border:     "var(--border)",
  borderFocus: "#4f46e5",
} as const;

export const spacing = {
  xs:  "4px",
  sm:  "8px",
  md:  "16px",
  lg:  "24px",
  xl:  "32px",
  "2xl": "48px",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  full: "9999px",
} as const;

export const fontSize = {
  xs:   "11px",
  sm:   "12px",
  base: "13px",
  md:   "14px",
  lg:   "16px",
  xl:   "18px",
  "2xl": "22px",
} as const;

export const shadow = {
  sm:  "0 1px 3px rgba(0,0,0,0.4)",
  md:  "0 4px 12px rgba(0,0,0,0.5)",
  lg:  "0 8px 32px rgba(0,0,0,0.6)",
  accent: "0 0 16px color-mix(in srgb, var(--accent) 15%, transparent)",
} as const;

// Tailwind class shorthands — use when you need className strings
export const tw = {
  bgBase:    "bg-canvas",
  bgSurface: "bg-surface",
  bgElevated: "bg-hover",
  accent:    "text-accent",
  textPrimary:   "text-foreground",
  textSecondary: "text-muted",
  border:    "border-border",
  ring:      "ring-accent",
} as const;
