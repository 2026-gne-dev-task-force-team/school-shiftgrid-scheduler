/**
 * 남의 일정 「출처」 레지스트리 + 달력이 채우는 calendar 모듈 — 달력이 뷰를 빌려주는 입구 하나.
 *   🔴 달력은 출처가 무엇을 담는지 모른다(분야 낱말 0). 모양(CalendarSource)만 받아 자기 뷰에 겹쳐 그린다.
 *   전이: registerSource(src) → 목록에 넣고 onChange 구독 · 돌려준 Disposable.dispose() → 빼고 구독 끊음(멱등).
 *   바뀜 알림: 출처 onChange 가 울리면 version 을 올려 구독자(useCalendarData)가 다시 그린다.
 *   ⭐ store.ts(scope)와 같은 결의 모듈 전역 싱글턴 — 테스트 격리는 __resetFeeds 로.
 */
import type { Calendar, CalendarSource } from './contracts/calendar';
import type { Disposable } from '../../pane-ui-system/plugin';
import { PALETTE_LEN } from './palette';
import { parseIcs } from './ics';
import { registerPreset } from './presets';

interface FeedEntry {
    source: CalendarSource;
    /** 등록 순서 색인(살아 있는 동안 고정) — color 를 안 준 출처의 기본 색 */
    colorIdx: number;
    /** 출처 onChange 구독(끊으면 dispose) · 출처가 onChange 에서 던지면 null */
    sub: Disposable | null;
}

let entries: FeedEntry[] = [];
let nextOrder = 0;
let version = 0;
const listeners = new Set<() => void>();

/** 바뀌었다 — version 올리고 구독자에게 알린다(다시 그린다). */
function emit(): void {
    version++;
    for (const l of listeners) l();
}

/** 출처 하나 등록 — 돌려준 Disposable 을 해제하면 출처·일정이 사라지고 onChange 구독도 끊긴다. */
export function registerSource(source: CalendarSource): Disposable {
    const order = nextOrder++;
    const entry: FeedEntry = { source, colorIdx: order % PALETTE_LEN, sub: null };
    // 바뀜 알림 구독 — 던지는 출처라도 등록은 산다(달력은 산다).
    try { entry.sub = source.onChange(() => emit()); } catch { entry.sub = null; }
    entries.push(entry);
    emit();

    let disposed = false;
    return {
        dispose() {
            if (disposed) return;                 // 멱등 — 두 번 불러도 안전
            disposed = true;
            const i = entries.indexOf(entry);
            if (i >= 0) entries.splice(i, 1);
            try { entry.sub?.dispose(); } catch { /* 출처가 망가져도 달력은 산다 */ }
            emit();
        },
    };
}

/** 달력이 provides 로 꽂는 모듈 — 출처 등록 + .ics 파서(가져오기·구독 공용) + 프리셋 등록(0.2). */
export const calendarModule: Calendar = { registerSource, parseIcs, registerPreset };

/** 출처 변경 구독(useSyncExternalStore 용) — register·dispose·출처 onChange 때 울린다. */
export function subscribeFeeds(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

/** 지금 버전(스냅샷) — 숫자가 바뀌면 다시 그린다. */
export function getFeedsVersion(): number {
    return version;
}

/** 등록된 출처 + 기본 색인(살아 있는 순서) — 매퍼(feed-events)가 읽는다. */
export function listFeedSources(): { source: CalendarSource; colorIdx: number }[] {
    return entries.map((e) => ({ source: e.source, colorIdx: e.colorIdx }));
}

/** id 로 살아 있는 출처 하나(없으면 null) — 카드가 editor 를 찾을 때. */
export function getFeedSource(id: string): CalendarSource | null {
    return entries.find((e) => e.source.id === id)?.source ?? null;
}

/** 🔴 테스트 격리용 — 전역 레지스트리를 비운다(구독까지). 앱 코드는 안 쓴다. */
export function __resetFeeds(): void {
    for (const e of entries) { try { e.sub?.dispose(); } catch { /* 무시 */ } }
    entries = [];
    nextOrder = 0;
    version = 0;
    listeners.clear();
}
