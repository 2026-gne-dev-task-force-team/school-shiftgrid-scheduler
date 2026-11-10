/** 인라인 SVG 아이콘 — ⛔ 아이콘 폰트·외부 CDN 0. 24 격자, currentColor 로 색을 물려받는다 */
import type { CSSProperties } from 'react';

export type IconName =
    | 'home' | 'table' | 'ban' | 'sparkles' | 'search' | 'edit' | 'layers' | 'printer'
    | 'undo' | 'redo' | 'save' | 'folder' | 'file' | 'plus' | 'trash' | 'check' | 'x'
    | 'info' | 'left' | 'right' | 'warn' | 'copy' | 'pin' | 'gear' | 'download' | 'upload' | 'play' | 'dot'
    | 'sun' | 'moon' | 'book' | 'help' | 'arrowRight'
    | 'menu' | 'dots' | 'panelLeft' | 'panelRight' | 'split' | 'splitH'
    | 'calendar' | 'calendarMini' | 'flask' | 'grip'
    | 'text' | 'hash' | 'chevronDown' | 'filter' | 'sort' | 'eye' | 'eyeOff'
    | 'users' | 'user' | 'door' | 'schedule' | 'fileText' | 'calendarEvent'
    | 'bell' | 'key' | 'shield' | 'shieldCheck' | 'puzzle' | 'up' | 'down' | 'database'
    | 'heading1' | 'heading2' | 'heading3' | 'list' | 'listNumbered' | 'quote' | 'code' | 'divider'
    | 'rowAbove' | 'rowBelow' | 'rowDel' | 'colLeft' | 'colRight' | 'colDel' | 'merge' | 'unmerge';

const P: Record<IconName, string> = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
    // 컬렉션(데이터베이스) — 원통 + 가운데 띠. 「표」(table)와 가른다(쥔님 2026-11-09 N1)
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    // 달력 — 상자 + 머리줄 + 고리 둘(쥔님 2026-11-01 16:55 *"캘린더 아이콘이 캘린더 스럽지 않아"* — table 격자를 쓰던 것을 바꿈)
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
    // 작은 달력(사이드 패널용) — 「창틀 왼쪽 패널에 든 작은 달력」: 창(panelLeft 꼴) + 왼쪽 칸 안에 고리 둘 달린 작은 달력.
    //   처음엔 달력에 점 하나였는데 쥔님 19:04 *"구분이 안 와닿는군"* → 달력 모양이 아니라 「어디에 뜨나」로 가른다
    calendarMini: 'M3 5h18v15H3zM10 5v15M5 10h3M5 13h3M5 16h3M15 9v2M18 9v2M13 11h7v6h-7z',
    ban: 'M5 5l14 14M12 3a9 9 0 100 18 9 9 0 000-18z',
    sparkles: 'M12 3l1.8 4.8L18.5 9.6 13.8 11.4 12 16.2 10.2 11.4 5.5 9.6 10.2 7.8zM19 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z',
    // 돋보기 — 원(중심 11,11 · 반지름 7) + 45° 손잡이. 18px 에서도 「검색」으로 읽히게(쥔님 2026-11-01 19:37)
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
    edit: 'M4 4h7M4 4v16h16v-7M20.5 3.5a2.1 2.1 0 013 3L12 18l-4 1 1-4z',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    printer: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v6H8z',
    undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 015 5',
    redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 00-5 5',
    save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
    folder: 'M3 6h6l2 2h10v11H3z',
    file: 'M6 2h8l4 4v16H6zM14 2v4h4',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
    check: 'M4 12l5 5L20 6',
    x: 'M6 6l12 12M18 6L6 18',
    bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20h4',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 10v7M12 7h.01',
    left: 'M15 5l-7 7 7 7',
    warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    // 압정(push-pin) — 머리는 둥근 갓, 아래로 바늘. ⛔ 옛 path 는 ⇧ 처럼 보였다(쥔님 지적 2026-10-31)
    pin: 'M12 16v5M7 9.4V5h-.5a2 2 0 010-4h11a2 2 0 010 4H17v4.4c0 .9.4 1.8 1.1 2.4l1 .9c.6.5.9 1.2.9 1.9H5c0-.7.3-1.4.9-1.9l1-.9c.7-.6 1.1-1.5 1.1-2.4z',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H10l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    play: 'M7 4l12 8-12 8z',
    dot: 'M12 10a2 2 0 100 4 2 2 0 000-4z',
    right: 'M9 5l7 7-7 7',
    arrowRight: 'M4 12h15M13 6l6 6-6 6',
    sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
    moon: 'M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z',
    book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 3v18',
    help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 013.9-2c1.6 1 1 3-1 3.5v1M12 17h.01',
    menu: 'M4 7h16M4 12h16M4 17h16',
    dots: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
    // 패널 접기/펴기 — 네모 안에 세로 칸막이. 왼쪽/오른쪽 패널을 각각 가리킨다
    panelLeft: 'M4 5h16v14H4zM9 5v14',
    panelRight: 'M4 5h16v14H4zM15 5v14',
    // 좌우로 가르기 — 네모를 가운데 세로선으로 둘로
    split: 'M4 5h16v14H4zM12 5v14',
    // 위아래로 가르기 — 네모를 가운데 가로선으로 둘로
    splitH: 'M4 5h16v14H4zM4 12h16',
    // 시험 플라스크(Pane UI Test) — 목·몸통·액체선. 단순 선 하나, 18px 에서도 「실험」으로 읽힌다(쥔님 2026-11-01: "창이랑 실험하는 아이콘")
    flask: 'M9 3h6M10 3v6l-4.3 8.7A1.5 1.5 0 007 20h10a1.5 1.5 0 001.3-2.3L14 9V3M8.5 14h7',
    // 끌기 손잡이 — 점 2×3(쥔님 2026-11-01 20:02 "핸들 아이콘스럽지 않고 잘 안 보여" — 세로 점 셋(dots)은 메뉴로 읽힌다)
    // 표 도구(R5-S10) — 행·열 넣기/지우기·칸 합치기/풀기. 격자 + 더하기/빼기/안쪽 화살표
    rowAbove: 'M3 12h18v8H3zM9 12v8M15 12v8M12 3v6M9 6h6',
    rowBelow: 'M3 4h18v8H3zM9 4v8M15 4v8M12 15v6M9 18h6',
    rowDel: 'M3 5h18v8H3zM9 5v8M15 5v8M9 18h6',
    colLeft: 'M12 3h9v18h-9zM12 9h9M12 15h9M3 12h6M6 9v6',
    colRight: 'M3 3h9v18H3zM3 9h9M3 15h9M15 12h6M18 9v6',
    colDel: 'M3 3h9v18H3zM3 9h9M3 15h9M15 12h6',
    merge: 'M3 5h18v14H3zM7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3',
    unmerge: 'M3 5h18v14H3zM12 5v14M9 9l-3 3 3 3M15 9l3 3-3 3',
    // 블록 종류(/ 메뉴) — 제목 1·2·3 은 H + 숫자, 목록은 점/숫자 + 줄, 인용은 따옴표, 코드는 꺾쇠+빗금, 구분선은 가로선
    heading1: 'M4 5v14M12 5v14M4 12h8M16 9l2-1.5V18',
    heading2: 'M4 5v14M12 5v14M4 12h8M15 9a2 2 0 014 0c0 2-4 4-4 7h4',
    heading3: 'M4 5v14M12 5v14M4 12h8M15 8h4l-2.5 3.5a2.3 2.3 0 11-2 3.5',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    listNumbered: 'M10 6h10M10 12h10M10 18h10M3.5 5l1.5-1v5M3.5 14.5c0-1.2 3-1.2 3 .3S3.5 17 3.5 18h3',
    quote: 'M4 17c0-4 1-7 4-8M4 17h4v-4H4M13 17c0-4 1-7 4-8M13 17h4v-4h-4',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    divider: 'M3 12h18M8 6h8M8 18h8',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    // 글자 칸(text) — 가로 글줄 세 개
    text: 'M5 7h14M5 12h14M5 17h9',
    // 숫자 칸(number) — 샵(#)
    hash: 'M10 4L8 20M16 4l-2 16M5 9h15M4 15h15',
    // 아래 꺾쇠 — 고르기 칸(select)·펼침 표시
    chevronDown: 'M6 9l6 6 6-6',
    // 깔때기 — 필터
    filter: 'M4 5h16l-6 7v6l-4 2v-8z',
    // 정렬 — 길이 다른 세 줄 + 내림 화살표
    sort: 'M4 6h12M4 12h8M4 18h4M17 7v11M17 18l3-3M17 18l-3-3',
    // 눈 — 칸 보이기
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z',
    // 눈 가림 — 칸 숨기기
    eyeOff: 'M4 4l16 16M9.5 9.6a3 3 0 004.3 4.2M6.6 6.7C4 8.3 2 12 2 12s4 7 10 7c1.7 0 3.2-.4 4.5-1M11 5.1C11.3 5 11.6 5 12 5c6 0 10 7 10 7s-.8 1.4-2.3 2.9',
    // 여러 사람(명단) — 앞사람 머리+어깨 + 뒤에 반쯤 걸친 한 사람. file 과 겹치던 명단을 가른다
    users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM4 20v-1a4 4 0 014-4h2a4 4 0 014 4v1M15 5.3a3 3 0 010 5.4M16 15.1a4 4 0 014 3.9v1',
    // 한 사람(레코드) — 머리 동그라미 + 어깨. 명단(users)의 한 명
    user: 'M12 3a4 4 0 100 8 4 4 0 000-8zM5 21v-1a6 6 0 016-6h2a6 6 0 016 6v1',
    // 문(방·방 목록) — 문틀 + 손잡이 점 + 바닥선. book/file 로 겹치던 방을 가른다
    door: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M4 21h16M14 12h.01',
    // 시간 격자 — 격자(오른 아래 한 칸을 비움) + 시계. 18px 에서 보통 표(table)와 한눈에 갈리게 시계를 얹었다
    schedule: 'M11 20H3V4h18v7M3 9h18M3 14h8M9 4v16M15 4v5M17 13a4 4 0 100 8 4 4 0 000-8zM17 15v2l1.5 1',
    // 글 있는 문서(페이지) — 파일 + 접힌 모서리 + 글줄 셋. 보통 file 과 갈린다
    fileText: 'M6 2h8l4 4v16H6zM14 2v4h4M9 12h6M9 16h6M9 8h3',
    // 일정(레코드) — 달력 몸통에 체크. 저장소(calendar)와 갈린다
    calendarEvent: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5M9 15l2 2 4-4',
    // 열쇠(암호) — 고리 + 자루 + 이빨 둘. pin(압정)으로 엉뚱하던 암호를 가른다
    key: 'M7 9a3 3 0 100 6 3 3 0 000-6zM10 12h10M16 12v3M19 12v3',
    // 방패(역할) — layers 로 엉뚱하던 역할을 가른다
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    // 방패+체크(정책) — check 혼자로 엉뚱하던 정책을 가른다
    shieldCheck: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    // 퍼즐 조각(플러그인) — play(재생)로 엉뚱하던 플러그인을 가른다
    puzzle: 'M10 3a2 2 0 012 2v1h3a1 1 0 011 1v3h1a2 2 0 010 4h-1v3a1 1 0 01-1 1h-3v-1a2 2 0 00-4 0v1H5a1 1 0 01-1-1v-3H3a2 2 0 010-4h1V7a1 1 0 011-1h3V5a2 2 0 012-2z',
    // 위로 화살표 — 항목 올리기(left 로 겹치던 「위로」)
    up: 'M12 20V4M6 10l6-6 6 6',
    // 아래로 화살표 — 항목 내리기(left 로 겹치던 「아래로」)
    down: 'M12 4v16M6 14l6 6 6-6',
};

/** 기본 아이콘 세트 이름 전부(노드 아이콘 고르기 창의 「아이콘」 탭이 쓴다) */
export const ICON_NAMES = Object.keys(P) as IconName[];

/** 점으로만 된 아이콘(⋮·끌기 손잡이) — 선 굵기 1.7 이면 점 하나가 1px 남짓이라 「편집이 없는 줄 알았다」(쥔님 검수 K3). 점은 굵게 찍는다. */
const DOT_ICONS = new Set<IconName>(['dots', 'grip']);

export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={DOT_ICONS.has(name) ? 3.2 : 1.7} strokeLinecap="round" strokeLinejoin="round"
            className={className} style={style} aria-hidden="true">
            <path d={P[name]} />
        </svg>
    );
}
