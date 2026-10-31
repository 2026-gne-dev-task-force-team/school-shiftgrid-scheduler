/**
 * 스케줄러 반응형 스토어 — activate 때 host 를 클로저로 받아 하나 만든다.
 *
 * 🔴 ⭐ 왜 플러그인 안에 스토어가 또 있나: 창틀은 도메인(스케줄)을 모른다. 카드·줄은 플러그인 몫이라
 *    플러그인이 제 상태를 쥐고, 뷰 둘(WeekView·CardView)이 같은 스토어를 구독해 한쪽 편집이 바로 반영된다.
 *
 * ⭐ 상태 = { schedule(저장됨), selectedCardId(기기·뷰 상태, 저장 안 함) } 를 한 불변 객체로.
 *    useSyncExternalStore 가 안정된 스냅샷을 받도록 바뀔 때마다 객체를 통째로 새로 만든다.
 *
 * 🔴 피크 우회(「호스트에 바라는 것」): host.workspace.open(where:'peek') 는 reuse·singleton 을 안 먹어
 *    카드를 클릭할 때마다 피크가 쌓인다. 그래서 selectedCardId 를 스토어에 두고 CardView 가 그걸 읽게 하고,
 *    피크는 "한 장만" 열어 둔다(열린 카드 피크의 leafId 를 작업대 이벤트로 추적). 상세는 selectedCardId 로 바뀐다.
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import {
    type Schedule, type Card, type Repeat, type GridDefaults,
    defaultSchedule, addCard, removeCard, moveCard, resizeCard, updateCard,
    resizeRow, addCol, removeCol, setColLabel, applyGrid, DEFAULT_GRID,
} from './model';
import { loadSchedule, saveSchedule } from './persist';

export interface SchedulerState {
    schedule: Schedule;
    selectedCardId: string | null;
}

export interface ScheduleStore {
    get(): SchedulerState;
    use(): SchedulerState;
    /** 카드 수 — 상태바가 읽는다 */
    cardCount(): number;
    // 선택
    select(cardId: string | null): void;
    // 카드
    add(input: { colKey: string; start: number; minutes: number; title: string; people?: string[]; place?: string; repeat?: Repeat }): string;
    remove(id: string): void;
    move(id: string, to: { colKey?: string; start?: number }): void;
    resize(id: string, minutes: number): void;
    update(id: string, patch: Partial<Omit<Card, 'id'>>): void;
    // 줄·열
    resizeRow(rowKey: string, minutes: number): void;
    addCol(): void;
    removeCol(colKey: string): void;
    setColLabel(colKey: string, label: string): void;
    // 눈금·전체
    applyGrid(g: GridDefaults): void;
    clear(): void;
}

export function createScheduleStore(host: PluginHost): ScheduleStore {
    let state: SchedulerState = { schedule: loadSchedule(host), selectedCardId: null };
    const listeners = new Set<() => void>();

    const emit = () => { for (const l of listeners) l(); };
    const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
    const getSnapshot = () => state;

    /** 스케줄을 갈아 끼우고 보관 + 알림 */
    const commit = (next: Schedule) => {
        state = { ...state, schedule: next };
        saveSchedule(host, next);
        emit();
    };

    return {
        get: getSnapshot,
        use: () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
        cardCount: () => state.schedule.cards.length,

        select(cardId) {
            if (state.selectedCardId === cardId) return;
            state = { ...state, selectedCardId: cardId };
            emit();
        },

        add(input) {
            const next = addCard(state.schedule, input);
            const created = next.cards[next.cards.length - 1];
            commit(next);
            return created.id;
        },
        remove(id) {
            const next = removeCard(state.schedule, id);
            state = { ...state, schedule: next, selectedCardId: state.selectedCardId === id ? null : state.selectedCardId };
            saveSchedule(host, next);
            emit();
        },
        move(id, to) { commit(moveCard(state.schedule, id, to)); },
        resize(id, minutes) { commit(resizeCard(state.schedule, id, minutes)); },
        update(id, patch) { commit(updateCard(state.schedule, id, patch)); },

        resizeRow(rowKey, minutes) { commit(resizeRow(state.schedule, rowKey, minutes)); },
        addCol() { commit(addCol(state.schedule)); },
        removeCol(colKey) { commit(removeCol(state.schedule, colKey)); },
        setColLabel(colKey, label) { commit(setColLabel(state.schedule, colKey, label)); },

        applyGrid(g) { commit(applyGrid(state.schedule, g)); },
        clear() {
            const next = defaultSchedule(gridDefaultsOf(host));
            state = { schedule: next, selectedCardId: null };
            saveSchedule(host, next);
            emit();
        },
    };
}

// ── 눈금 기본값(설정) — 기기별 저장. 스토어·설정 패널이 같이 쓴다 ──
const GRID_KEY = 'grid-defaults';

export function gridDefaultsOf(host: PluginHost): GridDefaults {
    const raw = host.storage.get<Partial<GridDefaults> | null>(GRID_KEY, null);
    return { ...DEFAULT_GRID, ...(raw ?? {}) };
}

export function saveGridDefaults(host: PluginHost, g: GridDefaults): void {
    host.storage.set(GRID_KEY, g);
}
