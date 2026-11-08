/**
 * 구독 ↔ 달력 잇기 — 켜진 구독을 달력 출처로 등록하고, 받기(fetch)로 lastIcs 를 갱신한다.
 *   🔴 달력 출처 등록·파서는 전부 **달력 약속 모듈**(host.modules.use('calendar'))로만 — 달력 내부 파일 직접 import 0.
 *   전이: 구독 노드가 바뀌면(추가·끄기·lastIcs 갱신·삭제) index 가 reconcile 을 부른다 → 켜진 것만 다시 등록 → 달력이 다시 그린다.
 *   받기: index(열 때)·설정 「새로고침」이 refresh 를 부른다 → fetch → updateSub(노드 갱신) → 노드 변경 → reconcile.
 */
import type { Calendar } from '../calendar/contracts/calendar';
import type { Disposable } from '../../pane-ui-system/plugin';
import { buildSources } from './model';
import { listSubs, updateSub } from './subscriptions';
import { fetchIcs, type FetchResult } from './fetch';

let calendarRef: Calendar | null = null;
const registered = new Map<string, Disposable>();

export function setCalendar(cal: Calendar | null): void { calendarRef = cal; }

/** 켜진 구독만 달력 출처로 (재)등록 — 전부 거뒀다 다시 올린다(구독 수가 적어 싸다). */
export function reconcile(): void {
    for (const d of registered.values()) d.dispose();
    registered.clear();
    if (!calendarRef) return;
    for (const { id, source } of buildSources(listSubs(), calendarRef.parseIcs)) {
        registered.set(id, calendarRef.registerSource(source));
    }
}

/** 활성 해제 — 등록한 출처를 전부 거두고 달력 참조를 놓는다. */
export function disposeAll(): void {
    for (const d of registered.values()) d.dispose();
    registered.clear();
    calendarRef = null;
}

/** 지금 등록된 출처 수(테스트·상태 확인). */
export function registeredCount(): number { return registered.size; }

/** 구독 하나 새로 받기 — 성공하면 lastIcs 갱신·오류 지움, 실패하면 오류만 남긴다(lastIcs 는 유지 → 캐시로 계속 보임). */
export async function refresh(id: string, fetcher: (url: string) => Promise<FetchResult> = fetchIcs): Promise<void> {
    const sub = listSubs().find((s) => s.id === id);
    if (!sub) return;
    const r = await fetcher(sub.data.url);
    if (r.ok) updateSub(id, { lastIcs: r.text, lastFetched: Date.now(), lastError: undefined });
    else updateSub(id, { lastFetched: Date.now(), lastError: r.error });
}

/** 켜진 구독 전부 새로 받기(열 때) — 각자 비동기, 실패해도 서로 안 막는다. */
export function refreshAllEnabled(fetcher: (url: string) => Promise<FetchResult> = fetchIcs): void {
    for (const s of listSubs()) if (s.data.enabled) void refresh(s.id, fetcher);
}
