/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "#070a14",
          base: "#0f1321",
          sidebar: "#0a0d1c",
          card: "#1b1f2e",
          hover: "#262939",
          active: "#2d3147",
        },
        brand: {
          DEFAULT: "#00d2ff",
          dim: "rgba(0,210,255,0.15)",
          border: "rgba(0,210,255,0.12)",
          glow: "rgba(0,210,255,0.25)",
        },
        text: {
          primary: "#dfe1f6",
          secondary: "#bbc9cf",
          muted: "#5c6b72",
          accent: "#a5e7ff",
        },
        danger: "#ff4d6d",
        success: "#10b981",
        warning: "#f59e0b",
        unread: "#00d2ff",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease",
        "slide-in": "slideIn 0.2s ease",
        pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideIn: { from: { transform: "translateX(-8px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
      },
    },
  },
  plugins: [],
};
