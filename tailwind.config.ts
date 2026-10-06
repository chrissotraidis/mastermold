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

        // --- Direct tokens ("Quiet instrument", docs/DESIGN.md) ---
        // Graphite neutrals so the one magenta signal and the state colors
        // carry meaning. Gold stays for the Sentinel crest only.
        void: "#0a090b",
        surface: {
          DEFAULT: "#151417",
          dim: "#111013",
          lowest: "#0e0d10",
          low: "#19181c",
          container: "#1f1d22",
          high: "#28262c",
          highest: "#343138",
        },
        panel: "#131215",
        "on-surface": "#f3f1f4",
        "on-surface-variant": "#c2bec6",
        outline: {
          DEFAULT: "#8d8892",
          variant: "#37343b",
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
        panel: "inset 0 1px 0 hsl(0 0% 100% / 0.035), 0 1px 2px rgb(0 0 0 / 0.35)",
        // Primary buttons: a crisp top highlight instead of a pink halo.
        glow: "inset 0 1px 0 hsl(0 0% 100% / 0.22), 0 1px 2px rgb(0 0 0 / 0.4)",
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
