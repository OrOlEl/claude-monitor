/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        argo: {
          bg: '#1a1a2e',
          sidebar: '#16213e',
          card: '#0f3460',
          border: '#1a3a5c',
          text: '#e4e4e7',
          muted: '#71717a',
          accent: '#00d2ff',
          warning: '#f59e0b',
          error: '#ef4444',
          success: '#22c55e',
        },
      },
    },
  },
  plugins: [],
};
