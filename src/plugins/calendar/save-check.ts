/**
 * 저장 전 검증 — 프리셋의 beforeSave 를 부르는 한 자리(만들기·고치기·옮기기가 같이 지난다).
 *   🔴 프리셋이 없거나 beforeSave 가 없으면 통과(기본 달력은 행동 변화 0) · 던지면 통과 + 경고.
 *   거절하면 이유를 구독자에게 알린다(뷰·토스트가 이어 받는 자리 — 이번 판은 자리만).
 */
import type { EventDraft, Occurrence, SaveContext, SaveVerdict } from './contracts/calendar';
import { isoMinuteOf } from './events';
import { getNodesApi } from './nodes';
import { presetOf } from './presets';
import { occurrences } from './series';

const rejectListeners = new Set<(reason: string, storeId: string) => void>();

/** 거절 알림 구독 — 해제 함수를 돌려준다. */
export function onSaveRejected(fn: (reason: string, storeId: string) => void): () => void {
    rejectListeners.add(fn);
    return () => { rejectListeners.delete(fn); };
}

export interface CheckOptions {
    kind: SaveContext['kind'];
    /** 고치는 중인 노드 id */
    eventId?: string;
    /** 자기 자신으로 치고 others 에서 뺄 회차(반복 회차 옮기기는 같은 회차만 뺀다) */
    isSelf?: (o: Occurrence) => boolean;
    /** 시험이 지금 시각을 고정한다 */
    now?: string;
}

export function checkBeforeSave(storeId: string, draft: EventDraft, opt: CheckOptions): SaveVerdict {
    const hook = presetOf(storeId).beforeSave;
    if (!hook) return { ok: true };
    const isSelf = opt.isSelf ?? ((o: Occurrence) => !!opt.eventId && o.eventId === opt.eventId);
    const ctx: SaveContext = {
        kind: opt.kind,
        storeId,
        eventId: opt.eventId,
        now: opt.now ?? isoMinuteOf(new Date()),
        others: (from, to) => occurrences(storeId, from, to).filter((o) => !isSelf(o)),
        storeData: (getNodesApi()?.get(storeId)?.data ?? {}) as Record<string, unknown>,
    };
    let v: SaveVerdict;
    try { v = hook(draft, ctx); } catch (e) {
        console.warn('[calendar] beforeSave 가 던졌다 — 통과로 본다', e);
        return { ok: true };
    }
    if (!v.ok) for (const l of [...rejectListeners]) l(v.reason, storeId);
    return v;
}
