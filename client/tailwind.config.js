/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0B0F17',
        surface: '#131B2B',
        'surface-hover': '#1B263B',
        'surface-card': '#162032',
        border: '#24324D',
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        facebook: '#1877F2',
        tiktok: '#FE2C55',
      },
    },
  },
  plugins: [],
}
