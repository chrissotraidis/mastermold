import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // shadcn semantic names, now mapped to the sentinel palette via CSS vars
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // --- Sentinel direct tokens (Industrial Glassmorphism) ---
        // Palette 2026-07-05: classic Sentinel identity — deep magenta/crimson
        // helmet primary, gold crest accents, silver-gray neutrals over the void.
        void: "#09060a",
        surface: {
          DEFAULT: "#181016",
          dim: "#130c11",
          lowest: "#0f0a0e",
          low: "#1d1319",
          container: "#23171e",
          high: "#2e2029",
          highest: "#3b2a34",
        },
        panel: "#140d12",
        "on-surface": "#f8edf2",
        "on-surface-variant": "#cdbdc6",
        outline: {
          DEFAULT: "#978591",
          variant: "#43333d",
        },
        // Legacy token name kept so hundreds of `*-violet` classes keep working;
        // the VALUES are the Master Mold magenta family (2026-09 overhaul).
        violet: {
          DEFAULT: "#f2559f",
          soft: "#ff9cc9",
          dim: "#c62f7a",
          deep: "#6f1743",
        },
        magenta: {
          DEFAULT: "#f2559f",
          soft: "#ff9cc9",
          dim: "#c62f7a",
          deep: "#6f1743",
        },
        tertiary: {
          DEFAULT: "#e4cb8b", // gold crest highlight
          container: "#c9a13b",
        },
        gold: {
          DEFAULT: "#c9a13b", // Sentinel crest/trim gold
          soft: "#e4cb8b",
          deep: "#836721",
        },
        // semantic authority / provenance language
        engine: "#10B981", // emerald — engine output / actionable / active
        demo: "#22d3ee", // cyan — seeded / simulated
        caution: "#FBBF24", // amber — threshold warnings
        critical: "#FB7185", // rose — kill / emergency
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        DEFAULT: "0.25rem",
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "inset 0 1px 0 hsl(330 80% 85% / 0.05), 0 18px 40px -24px rgb(0 0 0 / 0.75)",
        glow: "0 0 0 1px hsl(330 86% 64% / 0.35), 0 10px 30px -10px hsl(330 86% 55% / 0.45)",
      },
      keyframes: {
        "mm-enter": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "mm-sheet-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "mm-sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "mm-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "mm-enter": "mm-enter 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "mm-sheet-in": "mm-sheet-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "mm-sheet-up": "mm-sheet-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "mm-fade": "mm-fade 180ms ease-out both",
      },
      letterSpacing: {
        // Design pass: near-normal tracking so uppercase labels read as quiet
        // section headers, not console telemetry.
        telemetry: "0.02em",
      },
      spacing: {
        gutter: "24px",
        "margin-desktop": "64px",
        "margin-mobile": "20px",
        "panel-gap": "16px",
      },
      maxWidth: {
        deck: "1600px",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
