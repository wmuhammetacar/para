/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f6ff',
          100: '#e8edff',
          500: '#3b5bfd',
          600: '#2f49d8',
          700: '#2438a8'
        }
      }
    }
  },
  plugins: []
};
