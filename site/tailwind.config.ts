import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        uni: {
          sky: "#74B8CC",
          marine: "#235361",
          peach: "#FAAA93",
          steel: "#6494AC",
          chestnut: "#886351",
          mauve: "#D2ADAC",
        },
        deck: {
          bg: "#0A0E13",
          "bg-subtle": "#101720",
          card: "#151F2A",
          "card-hover": "#1A2735",
          border: "rgba(255, 255, 255, 0.08)",
          "border-hover": "rgba(255, 255, 255, 0.16)",
          text: "#F4F8FA",
          muted: "#8FA6B5",
          dim: "#546C7B",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 1px 3px 0 rgba(0, 0, 0, 0.2)",
        raised: "0 8px 24px -8px rgba(0, 0, 0, 0.6)",
      },
      screens: {
        xs: "420px",
      },
    },
  },
  plugins: [],
};

export default config;
