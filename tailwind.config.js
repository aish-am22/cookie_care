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
          DEFAULT: 'hsl(243, 82%, 60%)',
          'light': 'hsl(243, 82%, 66%)',
          'dark': 'hsl(243, 82%, 52%)',
        },
      }
    },
  },
  plugins: [],
}
