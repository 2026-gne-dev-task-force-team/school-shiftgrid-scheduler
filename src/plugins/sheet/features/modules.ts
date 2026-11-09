/**
 * 내장 기능 모듈 — 끼우고 뺀다(㉠ 개발자 조립). 각각 객체 하나 { id, needs, conflicts, install }.
 *   M1 넷: rows(행 조작) · fill(채우기 핸들) · paste-policy:append|clip(붙여넣기 넘침) · history(내장 되돌리기).
 *   ⭐ 「끌어서」 = 플러그인이 Table 을 새로 안 만들고 features 목록으로 가져다 쓴다(쥔님 2026-11-08 16:20).
 */
import type { TableFeature } from '../contracts/table';

/** 행 넣기·빼기·옮기기 + 맨 아래 「새 행」 자리를 켠다(UI 는 Table 이 이 능력을 보고 그린다). */
export const rowsFeature: TableFeature = {
    id: 'rows', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('rows'); },
};

/** 채우기 핸들(끌기) 을 켠다 — ⌘D·핸들 채우기는 엔진이 이미 하고, 이 모듈은 핸들 UI 를 켠다. */
export const fillFeature: TableFeature = {
    id: 'fill', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('fill'); },
};

/** 붙여넣기가 표보다 크면 행을 더한다. clip 과 서로 못 쓴다(둘 중 하나만). */
export const pastePolicyAppend: TableFeature = {
    id: 'paste-policy:append', version: '0.1.0',
    conflicts: ['paste-policy:clip'],
    install: (ctx) => ctx.paste.overflow('append'),
};

/** 붙여넣기가 표보다 크면 넘치는 줄을 버린다. append 와 서로 못 쓴다. */
export const pastePolicyClip: TableFeature = {
    id: 'paste-policy:clip', version: '0.1.0',
    conflicts: ['paste-policy:append'],
    install: (ctx) => ctx.paste.overflow('clip'),
};

/** 소유자가 undo 를 안 쥘 때 내장 스택(역트랜잭션) 을 켠다 — Table 이 onUndo/onRedo 없을 때만 쓴다. */
export const historyFeature: TableFeature = {
    id: 'history', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('history'); },
};

// ── M2 ────────────────────────────────────────────────────────────────────

/** 열 폭 끌기 + 더블클릭 자동 맞춤을 켠다(머리 오른쪽 경계). */
export const colResizeFeature: TableFeature = {
    id: 'col-resize', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('col-resize'); },
};

/** 머리(열 머리·행 머리)를 **같은 스크롤러 안에서** sticky 로 고정 — 스크롤바 폭 단차 0(달력 교훈). */
export const stickyHeadersFeature: TableFeature = {
    id: 'sticky-headers', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('sticky-headers'); },
};

/** 행 높이 ∝ weight · 행 머리 아래 경계 끌기 → axis.rowWeight 트랜잭션. 뷰 순서를 흔드는 sort·filter 와는 못 쓴다. */
export const rowWeightFeature: TableFeature = {
    id: 'row-weight', version: '0.1.0',
    conflicts: ['sort', 'filter'],
    install: (ctx) => { ctx.capabilities.enable('row-weight'); },
};

/** 행·열을 표에서 바로 늘리고 줄인다(머리 우클릭 넣기/빼기 · 이름 고치기). 행 조작이 바탕이라 rows 가 있어야 한다. */
export const axisEditFeature: TableFeature = {
    id: 'axis-edit', version: '0.1.0',
    needs: ['rows'],
    install: (ctx) => { ctx.capabilities.enable('axis-edit'); },
};

/** 열 타입별 편집기 — number·bool(체크)·select·multiselect. 열 정의의 type 을 Table 이 읽는다. */
export const colTypesFeature: TableFeature = {
    id: 'col-types', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('col-types'); },
};

/** 칸 검증 표시 — 손님의 validate(rowId,key,value) 를 읽어 빨강/노랑 테두리·툴팁(저장은 안 막는다). */
export const validateFeature: TableFeature = {
    id: 'validate', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('validate'); },
};

/** 칸 병합 — 범위를 골라 한 칸으로 덮는다. 뷰 순서/줄 수를 흔드는 sort·filter·virtual 과는 못 쓴다. */
export const mergeFeature: TableFeature = {
    id: 'merge', version: '0.1.0',
    conflicts: ['sort', 'filter', 'virtual'],
    install: (ctx) => { ctx.capabilities.enable('merge'); },
};

// ── M5 넘버스 ─────────────────────────────────────────────────────────────

/** 하단 합계 바 — 고른 범위의 합·평균·최소·최대·개수(머리·꼬리 행은 뺀다). */
export const quickCalcFeature: TableFeature = {
    id: 'quick-calc', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('quick-calc'); },
};

/** 표 스타일 프리셋(기본·가로선·줄무늬·머리 강조) — 표 손잡이 메뉴에서 고른다. */
export const tableStyleFeature: TableFeature = {
    id: 'table-style', version: '0.1.0',
    install: (ctx) => { ctx.capabilities.enable('table-style'); },
};

/** 내장 모듈 표 — 조립기가 문자열 id 를 이걸로 푼다. */
export const BUILTIN: Record<string, TableFeature> = {
    [rowsFeature.id]: rowsFeature,
    [fillFeature.id]: fillFeature,
    [pastePolicyAppend.id]: pastePolicyAppend,
    [pastePolicyClip.id]: pastePolicyClip,
    [historyFeature.id]: historyFeature,
    [colResizeFeature.id]: colResizeFeature,
    [stickyHeadersFeature.id]: stickyHeadersFeature,
    [rowWeightFeature.id]: rowWeightFeature,
    [axisEditFeature.id]: axisEditFeature,
    [colTypesFeature.id]: colTypesFeature,
    [validateFeature.id]: validateFeature,
    [mergeFeature.id]: mergeFeature,
    [quickCalcFeature.id]: quickCalcFeature,
    [tableStyleFeature.id]: tableStyleFeature,
};

/**
 * 기본 묶음 — 아무것도 안 적으면 이게 끼워진다(「설정 몰라도 바로」).
 *   ⭐ M5(2026-11-09 쥔님 「노션 취소 → 넘버스」): 넘버스 새 표가 주는 것 — 행·열 늘리기·열 폭·합치기·머리 고정
 *     + 채우기(노란 점)·합계 바·표 스타일. ⛔ 체크칸·검증·행 높이는 손님이 켠다.
 */
export const DEFAULT_FEATURES: string[] = [
    'rows', 'axis-edit', 'col-resize', 'merge', 'sticky-headers', 'paste-policy:append', 'history',
    'fill', 'quick-calc', 'table-style',
];
