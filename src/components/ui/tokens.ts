// Design tokens — single source of truth for the Cyber-Sentry dark palette.
// Import these instead of hardcoding colour strings throughout components.

export const colors = {
  // Backgrounds
  bgBase:    "#0f1321",
  bgSurface: "#1b1f2e",
  bgElevated: "#262939",
  bgHover:   "#2e3249",

  // Accent / brand
  accent:    "#00d2ff",
  accentDim: "rgba(0,210,255,0.15)",
  accentGlow: "rgba(0,210,255,0.08)",

  // Text
  textPrimary:   "#dfe1f6",
  textSecondary: "#bbc9cf",
  textMuted:     "rgba(187,201,207,0.5)",

  // Status
  success: "#22c55e",
  warning: "#f59e0b",
  error:   "#ef4444",
  info:    "#3b82f6",

  // Borders
  border:     "rgba(255,255,255,0.07)",
  borderFocus: "#00d2ff",
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
  accent: "0 0 16px rgba(0,210,255,0.15)",
} as const;

// Tailwind class shorthands — use when you need className strings
export const tw = {
  bgBase:    "bg-[#0f1321]",
  bgSurface: "bg-[#1b1f2e]",
  bgElevated: "bg-[#262939]",
  accent:    "text-[#00d2ff]",
  textPrimary:   "text-[#dfe1f6]",
  textSecondary: "text-[#bbc9cf]",
  border:    "border-white/[0.07]",
  ring:      "ring-[#00d2ff]",
} as const;
