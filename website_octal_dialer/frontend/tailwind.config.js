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
        dark: {
          bg: '#020617',
          card: '#0f172a',
          border: '#1e293b'
        }
      }
    },
  },
  plugins: [],
}
