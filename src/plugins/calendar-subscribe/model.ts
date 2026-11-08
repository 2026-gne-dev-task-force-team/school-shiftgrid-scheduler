/**
 * 링크 구독 — 순수 모델(React 0 · 노드 0 · fetch 0 · 레지스트리 0). 🔴 달력 내부 파일을 값으로 import 하지 않는다(꾸러미 경계).
 *   달력 약속의 **타입만** 끌어오고(parseIcs·registerSource 는 host.modules.use('calendar') 로 받는다), 색 토큰은 여기 하드코딩한다
 *   (팔레트 값을 달력에서 끌면 결합 — 토큰 「이름」은 창틀·달력 공통 약속이라 글자만 적는다).
 */
import type { CalendarItem, CalendarSource } from '../calendar/contracts/calendar';

/** 구독 하나의 저장값(노드 data) — 프로젝트 데이터와 같이 다닌다(노드). lastIcs 덕에 오프라인에서도 보인다. */
export interface SubData {
    name: string;
    url: string;
    /** 뜻색 토큰 이름(accent·ok·warn·bad·accenth) — 없으면 달력이 출처 순서 색. */
    color?: string;
    enabled: boolean;
    /** 마지막으로 받은(또는 파일로 넣은) 원본 .ics — 오프라인·갱신 전까지 이걸로 그린다. */
    lastIcs?: string;
    lastFetched?: number;
    /** 마지막 받기가 실패했으면 사람 말 안내(성공하면 지운다). */
    lastError?: string;
}

/** 구독 노드 하나(얇은 뷰). */
export interface SubNode { id: string; data: SubData }

/** 달력 팔레트 색 토큰 이름 — 달력 palette.ts 와 같은 순서(값이 아니라 이름만 공유). */
export const COLOR_TOKENS = ['accent', 'ok', 'warn', 'bad', 'accenth'] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** 구독 개수로 기본 색 하나 고른다(순환). */
export function defaultColor(index: number): ColorToken {
    return COLOR_TOKENS[((index % COLOR_TOKENS.length) + COLOR_TOKENS.length) % COLOR_TOKENS.length];
}

/** CORS 로 브라우저가 직접 못 받는 주소(구글 공휴일 ics 등)일 때 보여 주는 사람 말 안내. */
export const CORS_HINT =
    '이 주소는 브라우저에서 직접 받을 수 없습니다(사이트가 막아 둠). 그 주소의 .ics 파일을 내려받아 「파일로 넣기」로 넣어 주세요.';

/** webcal:// → https:// 로 바꾸고 공백을 다듬는다. */
export function normalizeUrl(url: string): string {
    const u = url.trim();
    return u.replace(/^webcal:\/\//i, 'https://');
}

/**
 * 구독 하나 → 달력 출처(CalendarSource). 🔴 읽기 전용(editor 없음) · 색 토큰이 있으면 모든 항목에 입힌다.
 *   list 는 범위를 안 거르고 받은 그대로 돌려준다(달력이 넓게 물어 각 뷰가 clip — "달력은 받은 대로 그린다").
 */
export function buildSource(id: string, label: string, color: string | undefined, items: readonly CalendarItem[]): CalendarSource {
    const colored: readonly CalendarItem[] = color ? items.map((it) => ({ ...it, color })) : items;
    return {
        id: `calendar-subscribe:${id}`,
        label,
        list: () => colored,
        onChange: () => ({ dispose() { /* 갱신은 재등록으로 — 구독엔 자체 변경 알림이 없다 */ } }),
        // editor 없음 → 남의 일정은 읽기 전용(쥔님: 링크 구독은 읽기 전용)
    };
}

/** 켜져 있고 받아 둔 .ics 가 있는 구독만 출처로 — parseIcs 는 달력 약속에서 받은 파서. */
export function buildSources(
    subs: readonly SubNode[],
    parseIcs: (text: string) => CalendarItem[],
): { id: string; source: CalendarSource }[] {
    const out: { id: string; source: CalendarSource }[] = [];
    for (const s of subs) {
        if (!s.data.enabled || !s.data.lastIcs) continue;
        out.push({ id: s.id, source: buildSource(s.id, s.data.name || '구독', s.data.color, parseIcs(s.data.lastIcs)) });
    }
    return out;
}
