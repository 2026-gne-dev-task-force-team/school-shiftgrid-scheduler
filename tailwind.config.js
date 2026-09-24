/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 어두운 바탕 — 뜻색은 ok/bad/warn 셋뿐, 나머지는 장식이 아니라 층이다
        bg: "#10151c",
        panel: "#161d27",
        panel2: "#1b2430",
        line: "#243041",
        text: "#e6e9ee",
        muted: "#8b95a5",
        accent: "#2b6cb0",
        accenth: "#3b82c4",
        ok: "#2f9e5b",
        bad: "#d64545",
        warn: "#d9a441",
      },
      fontFamily: {
        sys: ['system-ui', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
