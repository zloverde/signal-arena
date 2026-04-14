/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'IBM Plex Sans'", "sans-serif"],
      },
      colors: {
        arena: {
          bg: "#0a0e14",
          surface: "#111820",
          border: "#1e2d3d",
          accent: "#00d4ff",
          green: "#00ff88",
          red: "#ff4455",
          amber: "#ffaa00",
          muted: "#4a6070",
          text: "#c8d8e8",
        },
      },
    },
  },
  plugins: [],
};
