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
        // 노드 아이콘 색(8색 중 장식 셋) — 나머지는 accent·ok·warn·bad·muted
        'ic-purple': v('ic-purple'),
        'ic-pink': v('ic-pink'),
        'ic-teal': v('ic-teal'),
        // 사이드바 전용(판 A) — 에디터보다 한 단 어두운 바탕·탭 줄·경계선
        side: v('side'),
        side2: v('side2'),
        edge: v('edge'),
      },
      fontFamily: {
        sys: ['system-ui', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
      },
      // 치수도 색과 같은 층이다 — 화면 코드는 h-header 처럼 이름만 쓰고 몇 px 인지 모른다.
      // 손가락 기기에서 값이 커지는 것도 index.css 변수가 혼자 한다.
      height: {
        topbar: 'var(--s-topbar)',
        header: 'var(--s-header)',
        row: 'var(--s-row)',
        btn: 'var(--s-btn)',
        railbtn: 'var(--s-railbtn)',
        titlebar: 'var(--s-titlebar)',
        statusbar: 'var(--s-statusbar)',
        rail: 'var(--s-rail)',          // 리본을 상단에 눕혔을 때의 줄 높이(= 세로일 때의 폭)
      },
      // 글자 크기 단계 — 값은 index.css 의 --fs-* 한 곳. 화면 코드는 text-small 처럼 이름만 쓴다(text-[12px] 같은 임의 크기는 톱니 검사가 늘림을 막는다).
      //   타일윈드 기본 이름(xs·sm·base)과 안 겹치게 따로 지었다 — 기존 text-xs/sm 의 뜻을 안 바꾼다.
      fontSize: {
        micro: 'var(--fs-micro)',   // 10px — 배지·꼬리표
        note: 'var(--fs-note)',     // 11px — 보조 설명·상태바
        small: 'var(--fs-small)',   // 12px — 부가 줄·작은 단추
        body: 'var(--fs-body)',     // 13px — 본문(기본)
        lead: 'var(--fs-lead)',     // 14px — 머리글·강조
      },
      width: { btn: 'var(--s-btn)', rail: 'var(--s-rail)', railbtn: 'var(--s-railbtn)' },
      spacing: { pad: 'var(--s-pad)' },
      // 겹 단계(z-modal·z-popover …)·움직임(duration-fast …) 유틸은 index.css 의 @layer utilities 에 산다(값과 한 곳).
    },
  },
  plugins: [],
}
