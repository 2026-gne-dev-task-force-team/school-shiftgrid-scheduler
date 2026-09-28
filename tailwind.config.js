/** @type {import('tailwindcss').Config} */
// 색은 전부 CSS 변수(src/index.css 의 html[data-theme]) 에서 온다.
// 화면 코드는 bg-panel · text-muted 같은 이름만 쓰고 밝은/어두운 값은 몰라야 한다 — 그래야 테마를 바꿔도 화면이 안 깨진다.
// 변수 값은 "r g b" 세 수다 (Tailwind 의 /<alpha-value> 불투명도 문법이 그대로 먹게).
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 뜻색은 ok/bad/warn 셋뿐, 나머지는 장식이 아니라 층이다
        bg: v('bg'),
        panel: v('panel'),
        panel2: v('panel2'),
        line: v('line'),
        text: v('text'),
        muted: v('muted'),
        accent: v('accent'),
        accenth: v('accenth'),
        ok: v('ok'),
        bad: v('bad'),
        warn: v('warn'),
      },
      fontFamily: {
        sys: ['system-ui', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
