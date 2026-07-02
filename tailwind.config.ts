import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07100d",
        panel: "#101a16",
        line: "#22312b",
        lime: "#b8f23b",
        mint: "#1fd58a",
        danger: "#ff5c72",
      },
      boxShadow: {
        glow: "0 0 28px rgba(184, 242, 59, 0.13)",
      },
    },
  },
  plugins: [],
} satisfies Config;
