import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#080C10",
          "bg-subtle": "#0D1219",
          card: "#121822",
          "card-hover": "#17212F",
          "card-active": "#1D2A3C",
          border: "rgba(255, 255, 255, 0.08)",
          "border-hover": "rgba(255, 255, 255, 0.16)",
          "border-focus": "rgba(56, 189, 248, 0.4)",
          text: "#F8FAFC",
          muted: "#94A3B8",
          dim: "#64748B",
          cyan: "#38BDF8",
          emerald: "#10B981",
          indigo: "#6366F1",
          amber: "#F59E0B",
          rose: "#F43F5E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 10px 30px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.07)",
        "card-hover": "0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(56, 189, 248, 0.25)",
        glow: "0 0 50px -10px rgba(56, 189, 248, 0.2)",
        "glow-emerald": "0 0 45px -10px rgba(16, 185, 129, 0.25)",
        "glow-indigo": "0 0 45px -10px rgba(99, 102, 241, 0.25)",
      },
      screens: {
        xs: "420px",
      },
    },
  },
  plugins: [],
};

export default config;
