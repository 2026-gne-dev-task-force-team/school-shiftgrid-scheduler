/**
 * 달력 뷰 빌려주기 — 호스트 끝단 배선. calendar(provides) + contract-calendar(약속) 가 같이 켜지면
 *   다른 플러그인이 host.modules 로 calendar 를 받아 출처를 등록할 수 있고, 달력이 그걸 끌어와 그린다.
 *   🔴 전역 싱글턴(nodes·feed)이라 afterEach 에서 비운다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { activateAll, listPlugins, disposeOwner } from '../../pane-ui-system/plugin';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { calendarPlugin } from './index';
import { contractCalendarPlugin } from '../contract-calendar';
import { listFeedSources, __resetFeeds } from './feed';
import { mapFeedEvents } from './feed-events';
import type { Calendar, CalendarSource } from '../contract-calendar/types';

// 🔴 calendar 는 requires.nodes — nodes 약속을 선언·제공하는 코어 가짜가 먼저 있어야 막히지 않는다(declarative 테스트와 같은 결).
const registrar: PluginModule = {
    manifest: {
        id: 'project-explorer', name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
        provides: { nodes: '0.1.0' },
        contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
    },
    modules: {
        nodes: {
            registerContributed: () => ({ dispose() { } }),
            subscribe: () => ({ dispose() { } }),
            byType: () => [],
        },
    },
};

const fakeSource: CalendarSource = {
    id: 'duty', label: '당직',
    list: () => [{ id: 'd1', title: '야간 당직', start: '2026-11-10T18:00', end: '2026-11-10T22:00', allDay: false }],
    onChange: () => ({ dispose() { } }),
};

let reg: { dispose(): void } | null = null;
const consumer: PluginModule = {
    manifest: { id: 'feed-consumer', name: 'FC', version: '0.1.0', minHostVersion: '0.1.0', requires: { calendar: '^0.1' } },
    lifecycle: {
        onActivate(host) {
            const cal = host.modules.use<Calendar>('calendar');
            reg = cal ? cal.registerSource(fakeSource) : null;
        },
    },
    deactivate() { reg?.dispose(); reg = null; },
};

afterEach(() => {
    for (const id of ['feed-consumer', 'calendar', 'contract-calendar', 'project-explorer']) disposeOwner(id);
    __resetFeeds();
    reg = null;
});

describe('calendar 약속 + 제공자(달력) + 소비자 — 끝단', () => {
    it('contract-calendar 가 같이 켜지면 달력은 안 막히고 provides.calendar 가 선다', () => {
        activateAll([registrar, contractCalendarPlugin, calendarPlugin]);
        const find = (id: string) => listPlugins().find((p) => p.id === id)!;
        expect(find('calendar').blocked).toBe(false);
        expect(find('calendar').failed).toBe(false);
        expect(find('contract-calendar').blocked).toBe(false);
    });

    it('소비자가 host.modules 로 calendar 를 받아 출처를 등록하면 달력 레지스트리에 뜬다', () => {
        activateAll([registrar, contractCalendarPlugin, calendarPlugin, consumer]);
        expect(listPlugins().find((p) => p.id === 'feed-consumer')!.blocked).toBe(false);

        // 등록됐다 — 달력이 읽는 목록에 출처가 있고, 매퍼로 끌면 그 일정이 그려진다(끝단).
        expect(listFeedSources().map((e) => e.source.id)).toEqual(['duty']);
        const drawn = mapFeedEvents(listFeedSources(), '2026-11-01T00:00', '2026-11-30T23:59');
        expect(drawn.map((e) => e.name)).toEqual(['야간 당직']);
        expect(drawn[0].foreign?.sourceLabel).toBe('당직');
    });

    it('약속(contract-calendar)이 없으면 달력 provides 가 「약속 없음」으로 막힌다(= plugins.ts 미반영 시 앱이 깨진다)', () => {
        activateAll([registrar, calendarPlugin]);    // contract-calendar 를 뺀다
        const cal = listPlugins().find((p) => p.id === 'calendar')!;
        expect(cal.blocked).toBe(true);
        expect(cal.reason).toContain('calendar');
    });
});
