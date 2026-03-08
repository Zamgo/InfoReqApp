/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Oficiální paleta Controlis z vizuálního stylu (Controlis-logo-v03.pdf)
        controlis: {
          primary: "#c82127",
          "primary-hover": "#d92d33",
          text: "#1b1b1b",
          gray: "#565656",
          background: "#eeeded",
        },
        // Přepsaná red paleta = Controlis červená (všechny red-* v appce pak sedí na manuál)
        red: {
          50: "#fef2f2",
          100: "#fde8e8",
          200: "#fbd5d6",
          300: "#f8b4b5",
          400: "#f28487",
          500: "#e94d51",
          600: "#d92d33",
          700: "#c82127",
          800: "#a91d22",
          900: "#8c191e",
          950: "#4d0e11",
        },
        // Přepsaná slate = odstupňované šedé z manuálu (#1b1b1b, #565656, #eeeded)
        slate: {
          50: "#fafafa",
          100: "#eeeded",
          200: "#e2e2e1",
          300: "#c9c9c8",
          400: "#9e9e9d",
          500: "#757574",
          600: "#565656",
          700: "#454545",
          800: "#2d2d2d",
          900: "#1b1b1b",
          950: "#0f0f0f",
        },
      },
    },
  },
  plugins: [],
}

