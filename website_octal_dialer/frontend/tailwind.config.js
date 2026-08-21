/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#27272a',
          800: '#18181b',
          850: '#121215',
          900: '#09090b',
          950: '#000000',
        },
        dark: {
          bg: '#000000',
          card: '#09090b',
          border: '#18181b',
          elevated: '#121215'
        }
      }
    },
  },
  plugins: [],
}
