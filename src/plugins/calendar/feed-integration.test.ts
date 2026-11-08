/**
 * 달력 뷰 빌려주기 — 호스트 끝단 배선. 🔴 꾸러미 전환(2026-11-08): 달력 꾸러미가 calendar 약속을 **들고 와**(contributes.interfaces)
 *   채운다(provides) — 별도 contract-calendar 플러그인은 없다. 다른 플러그인이 host.modules 로 calendar 를 받아 출처를 등록하면
 *   달력이 그걸 끌어와 그린다. 🔴 전역 싱글턴(nodes·feed)이라 afterEach 에서 비운다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { activateAll, listPlugins, disposeOwner } from '../../pane-ui-system/plugin';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { calendarPlugin } from './index';
import { listFeedSources, __resetFeeds } from './feed';
import { mapFeedEvents } from './feed-events';
import type { Calendar, CalendarSource } from './contracts/calendar';

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
    for (const id of ['feed-consumer', 'calendar', 'project-explorer']) disposeOwner(id);
    __resetFeeds();
    reg = null;
});

describe('calendar 약속 + 제공자(달력) + 소비자 — 끝단', () => {
    it('달력 꾸러미가 calendar 약속을 들고 와 채운다 — 안 막히고 약속이 선다', () => {
        activateAll([registrar, calendarPlugin]);
        const cal = listPlugins().find((p) => p.id === 'calendar')!;
        expect(cal.blocked).toBe(false);
        expect(cal.failed).toBe(false);
        // 🔴 꾸러미가 약속을 들고 온다 — contributes.interfaces 에 calendar 가 있고 provides 로 채운다(둘 다 같은 꾸러미).
        expect(cal.interfaces.map((i) => i.name)).toContain('calendar');
        expect(cal.provides.calendar).toBe('0.1.0');
    });

    it('소비자가 host.modules 로 calendar 를 받아 출처를 등록하면 달력 레지스트리에 뜬다', () => {
        activateAll([registrar, calendarPlugin, consumer]);
        expect(listPlugins().find((p) => p.id === 'feed-consumer')!.blocked).toBe(false);

        // 등록됐다 — 달력이 읽는 목록에 출처가 있고, 매퍼로 끌면 그 일정이 그려진다(끝단).
        expect(listFeedSources().map((e) => e.source.id)).toEqual(['duty']);
        const drawn = mapFeedEvents(listFeedSources(), '2026-11-01T00:00', '2026-11-30T23:59');
        expect(drawn.map((e) => e.name)).toEqual(['야간 당직']);
        expect(drawn[0].foreign?.sourceLabel).toBe('당직');
    });
});
