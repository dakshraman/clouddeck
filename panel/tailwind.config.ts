import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#0B0F17",
          panel: "#111827",
          border: "#1F2937",
          accent: "#6366F1",
        },
      },
    },
  },
  plugins: [],
};

export default config;
