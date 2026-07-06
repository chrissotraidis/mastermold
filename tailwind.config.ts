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
        void: "#0f090b",
        surface: {
          DEFAULT: "#211318",
          dim: "#1f1116",
          lowest: "#1c0e13",
          low: "#2a1c21",
          container: "#2e2025",
          high: "#382b30",
          highest: "#44363b",
        },
        panel: "#1f1116",
        "on-surface": "#f5e5eb",
        "on-surface-variant": "#d2c9cc",
        outline: {
          DEFAULT: "#9c9296",
          variant: "#50484b",
        },
        // Legacy token name kept so hundreds of `*-violet` classes keep working;
        // the VALUES are now the Sentinel helmet magenta family.
        violet: {
          DEFAULT: "#f5adc8",
          dim: "#d65c87",
          deep: "#8e2e52",
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
