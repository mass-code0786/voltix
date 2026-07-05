import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07100d",
        panel: "#101a16",
        line: "#22312b",
        lime: "#18FF8A",
        mint: "#00C96B",
        danger: "#ff5c72",
      },
      boxShadow: {
        glow: "0 0 28px rgba(24, 255, 138, 0.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
