/**
 * 구독 끝단 — 노드에 저장한 구독을 달력 출처로 등록하고, 달력이 그린다(real 달력 feed + 노드 harness).
 *   · 구독 → registerSource → 달력이 끌어 그린다(범위 안 항목) · 읽기 전용
 *   · 끄기·지우기 → 사라짐
 *   · 받기 실패 → 안내 상태(lastError) · lastIcs 는 유지(캐시로 계속 보임)
 *   · 받기 성공 → lastIcs 갱신
 * (테스트 파일은 구조 검사 walk 가 건너뛰므로 달력 내부(feed·events)를 직접 import 해 끝단을 잰다.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost } from '../../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (b.clear) store.clear();
        for (const v of b.put ?? []) store.set(v.id as string, v);
        for (const id of b.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore } from '../../project-explorer/store';
import { __resetPersistForTest } from '../../project-explorer/persist';
import { makeNodesApi } from '../../project-explorer/api';
import { registerType, clearTypes } from '../../project-explorer/model/types';
import { clearDerived } from '../../project-explorer/model/derive';
import { calendarModule, listFeedSources, __resetFeeds } from '../feed';
import { mapFeedEvents } from '../feed-events';
import { eventsInRange } from '../events';
import { parseIcs, writeIcs } from '../ics';
import { itemToIcs } from '../io';
import { SUB_TYPE, initSubs, listSubs, addSub, updateSub, removeSub, getSubById } from './subscriptions';
import { setCalendar, reconcile, disposeAll, refresh, registeredCount } from './controller';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
    } as unknown as PluginHost;
}

const ICS = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN',
    'BEGIN:VEVENT', 'UID:h1', 'DTSTART;VALUE=DATE:20260101', 'DTEND;VALUE=DATE:20260102', 'SUMMARY:신정', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:h2', 'DTSTART;VALUE=DATE:20260601', 'DTEND;VALUE=DATE:20260602', 'SUMMARY:지방선거일', 'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

let bridge: { dispose(): void } | null = null;

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest(); __resetFeeds();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
    const api = makeNodesApi('calendar-subscribe');
    api.registerContributed({ type: SUB_TYPE, label: '구독', record: true }, {}, host());
    bridge = initSubs(api);
    setCalendar(calendarModule);
});
afterEach(() => { bridge?.dispose(); bridge = null; disposeAll(); __resetFeeds(); __resetPersistForTest(); });

function addEnabledWithIcs(name: string, ics: string): string {
    const id = addSub(name, 'https://example.com/a.ics', 'warn');
    updateSub(id, { lastIcs: ics });
    return id;
}

describe('구독 → registerSource → 달력이 그린다', () => {
    it('켜진 구독이 달력 출처로 등록되고, 범위 안 항목이 그려진다(읽기 전용)', () => {
        addEnabledWithIcs('공휴일', ICS);
        reconcile();
        expect(listFeedSources().map((e) => e.source.id)).toEqual(['calendar-subscribe:' + listSubs()[0].id]);

        const drawn = mapFeedEvents(listFeedSources(), '1970-01-01T00:00', '2999-12-31T23:59');
        // 1월 범위로 좁히면 신정만
        const jan = eventsInRange(drawn, new Date(2026, 0, 1).getTime(), new Date(2026, 0, 31).getTime());
        expect(jan.map((e) => e.name)).toEqual(['신정']);
        // 남의 일정이라 읽기 전용
        expect(drawn.every((e) => e.foreign?.readOnly === true)).toBe(true);
        expect(drawn.every((e) => e.foreign?.sourceLabel === '공휴일')).toBe(true);
    });
});

describe('끄기·지우기 → 사라짐', () => {
    it('끄면 출처가 빠진다', () => {
        const id = addEnabledWithIcs('공휴일', ICS);
        reconcile();
        expect(registeredCount()).toBe(1);
        updateSub(id, { enabled: false });
        reconcile();
        expect(registeredCount()).toBe(0);
        expect(listFeedSources()).toEqual([]);
    });
    it('지우면 출처가 빠진다', () => {
        const id = addEnabledWithIcs('공휴일', ICS);
        reconcile();
        removeSub(id);
        reconcile();
        expect(registeredCount()).toBe(0);
    });
});

describe('내보내기 — 구독 노드(lastIcs → 우리 작성기 꼴 .ics)', () => {
    // index.ts 명령 'calendar-subscribe.export' 가 쓰는 변환 그대로: parseIcs(lastIcs) → itemToIcs → writeIcs.
    it('받아 둔 일정을 .ics 로 내면 같은 일정이 돈다(왕복)', () => {
        const id = addEnabledWithIcs('공휴일', ICS);
        const sub = getSubById(id)!;
        const ics = writeIcs(parseIcs(sub.data.lastIcs ?? '').map(itemToIcs));
        const round = parseIcs(ics);
        expect(round.map((e) => e.title).sort()).toEqual(['신정', '지방선거일']);
    });
    it('받아 둔 게 없으면(lastIcs 없음) 빈 달력이 난다(일정 0)', () => {
        const id = addSub('빈 구독', 'https://example.com/a.ics');
        const sub = getSubById(id)!;
        const ics = writeIcs(parseIcs(sub.data.lastIcs ?? '').map(itemToIcs));
        expect(parseIcs(ics).length).toBe(0);
    });
});

describe('받기 — 성공·실패', () => {
    it('실패하면 lastError 가 남고 lastIcs(캐시)는 유지된다', async () => {
        const id = addEnabledWithIcs('공휴일', ICS);
        await refresh(id, async () => ({ ok: false, error: '막힘' }));
        const d = listSubs().find((s) => s.id === id)!.data;
        expect(d.lastError).toBe('막힘');
        expect(d.lastIcs).toBe(ICS);            // 캐시는 그대로 → 계속 보인다
    });
    it('성공하면 lastIcs 갱신·오류 지움', async () => {
        const id = addEnabledWithIcs('공휴일', 'OLD');
        await refresh(id, async () => ({ ok: true, text: ICS }));
        const d = listSubs().find((s) => s.id === id)!.data;
        expect(d.lastIcs).toBe(ICS);
        expect(d.lastError).toBeUndefined();
        expect(typeof d.lastFetched).toBe('number');
    });
});
