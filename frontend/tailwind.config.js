export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      spacing: {
        4.5: "1.125rem",
      },
      colors: {
        cream: {
          bg: "#F3F1E9",
          surface: "#F8F7F2",
          muted: "#EEECE4",
          card: "rgba(255, 255, 255, 0.65)",
        },
        ink: {
          DEFAULT: "#1F1F1D",
          muted: "#686760",
          subtle: "#8E8C82",
        },
        brand: {
          50: "#F8F7F2",
          100: "#EEECE4",
          500: "#1F1F1D",
          600: "#1F1F1D",
          700: "#000000",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"],
        serif: ["'Newsreader'", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
