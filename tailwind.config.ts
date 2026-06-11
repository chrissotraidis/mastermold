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
        void: "#0A0612",
        surface: {
          DEFAULT: "#180e26",
          dim: "#160C24",
          lowest: "#130921",
          low: "#21172f",
          container: "#251b33",
          high: "#30253e",
          highest: "#3b304a",
        },
        panel: "#160C24",
        "on-surface": "#eddcfe",
        "on-surface-variant": "#cbc3d7",
        outline: {
          DEFAULT: "#958ea0",
          variant: "#494454",
        },
        violet: {
          DEFAULT: "#d0bcff",
          dim: "#a078ff",
          deep: "#6d3bd7",
        },
        tertiary: {
          DEFAULT: "#fda9ff", // magenta surgical highlight
          container: "#e34df4",
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
        telemetry: "0.05em",
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
