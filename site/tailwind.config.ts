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
        bg: {
          DEFAULT: "#FAF7F5",
          soft: "#F4EFEB",
          dark: "#0C171C",
          "dark-2": "#122228",
          "dark-3": "#182D35",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F7F3F0",
          dark: "#122228",
          "dark-card": "#172B33",
          "dark-card-hover": "#1D353F",
        },
        border: {
          light: "rgba(210, 173, 172, 0.45)",
          steel: "rgba(100, 148, 172, 0.35)",
          dark: "rgba(116, 184, 204, 0.2)",
          "dark-subtle": "rgba(255, 255, 255, 0.08)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        uni: "0 20px 45px -15px rgba(35, 83, 97, 0.12), 0 0 0 1px rgba(210, 173, 172, 0.35)",
        "uni-dark": "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(116, 184, 204, 0.18)",
        glow: "0 0 40px rgba(116, 184, 204, 0.25)",
        "glow-peach": "0 0 35px rgba(250, 170, 147, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;

