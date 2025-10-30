/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{App,components}/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-blue': {
          DEFAULT: 'hsl(210, 90%, 50%)',
          'light': 'hsl(210, 90%, 55%)',
          'dark': 'hsl(210, 90%, 45%)',
        },
      }
    },
  },
  plugins: [],
}