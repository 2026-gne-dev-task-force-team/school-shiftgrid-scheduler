/**
 * 내장 기능 모듈 — 끼우고 뺀다(㉠ 개발자 조립). 각각 객체 하나 { id, needs, conflicts, install }.
 *   M1 넷: rows(행 조작) · fill(채우기 핸들) · paste-policy:append|clip(붙여넣기 넘침) · history(내장 되돌리기).
 *   ⭐ 「끌어서」 = 플러그인이 Table 을 새로 안 만들고 features 목록으로 가져다 쓴다(쥔님 2026-11-08 16:20).
 */
import type { TableFeature } from '../../contract-table/types';

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

/** 내장 모듈 표 — 조립기가 문자열 id 를 이걸로 푼다. */
export const BUILTIN: Record<string, TableFeature> = {
    [rowsFeature.id]: rowsFeature,
    [fillFeature.id]: fillFeature,
    [pastePolicyAppend.id]: pastePolicyAppend,
    [pastePolicyClip.id]: pastePolicyClip,
    [historyFeature.id]: historyFeature,
};

/** 기본 묶음 — 아무것도 안 적으면 이게 끼워진다(「설정 몰라도 바로」). */
export const DEFAULT_FEATURES: string[] = ['rows', 'fill', 'paste-policy:append', 'history'];
