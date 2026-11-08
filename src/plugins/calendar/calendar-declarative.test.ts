/**
 * 달력 선언형 전환 증명(D3) — 매니페스트 contributes 로 켜면 「옛 집합」과 같은 뷰·명령·리본·설정이 꽂히나.
 *
 * ⭐ 옛 길은 onActivate 안에서 host.views.register·commands.add·ribbon.add·settings.addSection/addItem 를
 *    직접 불렀다. 지금은 contributes 에 적고 이름으로 구현을 가리킨다 — 꽂힌 결과(레지스트리)는 전후 같아야 한다.
 *    그래서 「옛 집합」을 골든으로 박아 두고 대조한다(한 글자라도 달라지면 여기서 걸린다).
 *
 * 🔴 모듈 전역 레지스트리라 테스트끼리 안 번지게 beforeEach 에서 비운다(contributes.test.ts 와 같은 결).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getView, clearViews } from '../../pane-ui-system/view-registry';
import {
    activateAll, listPlugins, disposeOwner,
    listRibbonActions, listSettings, listCommands, getCommand,
} from '../../pane-ui-system/plugin';
import type { PluginModule } from '../../pane-ui-system/plugin';
import { calendarPlugin } from './index';
import { contractCalendarPlugin } from '../contract-calendar';

// 🔴 calendar 가 contributes.nodeTypes(저장소·일정)를 내고 requires.nodes 를 선언하므로, nodes 를 채우는 제공자(코어)가
//    먼저 켜져 있어야 한다 — 없으면 calendar 가 blocked 가 된다. 여기선 뷰·명령·리본·설정 집합만 보므로 nodes 모듈은
//    최소 가짜로 둔다(registerContributed·subscribe·byType — calendar onActivate 의 다리가 쓴다).
const registrar: PluginModule = {
    manifest: {
        id: 'project-explorer', name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
        provides: { nodes: '0.1.0' },
        // 🔴 3판 — nodes 약속도 이 가짜가 선언한다(약속 없이는 provides 가 「약속 없음」으로 막혀 calendar 까지 끊긴다).
        contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
    },
    modules: {
        nodes: {
            registerContributed: () => ({ dispose() { /* 테스트 */ } }),
            subscribe: () => ({ dispose() { /* 테스트 */ } }),
            byType: () => [],
        },
    },
};

beforeEach(() => { disposeOwner('calendar'); disposeOwner('project-explorer'); disposeOwner('contract-calendar'); clearViews(); });

describe('달력 선언형 전환 — contributes 로 꽂힌 집합이 옛 집합과 같다', () => {
    it('뷰·명령·리본·설정이 옛 등록과 같은 집합으로 꽂히고 활성 실패가 없다', () => {
        // 🔴 calendar 가 provides.calendar 를 선언하므로, 그 약속을 선언하는 contract-calendar 가 같이 켜져 있어야 막히지 않는다.
        activateAll([registrar, contractCalendarPlugin, calendarPlugin]);

        // 활성 실패 아님(이름이 구현과 다 맞는다)
        expect(listPlugins().find((p) => p.id === 'calendar')?.failed).toBe(false);

        // ── 뷰 둘 — host 가 'calendar.' 접두사를 붙인다(옛 host.views.register 와 같은 id·제목·자리) ──
        const month = getView('calendar.month');
        const mini = getView('calendar.mini');
        expect(month?.title).toBe('달력');
        expect(month?.placement).toEqual({ areas: ['center'], split: false, singleton: true });
        expect(mini?.title).toBe('작은 달력');
        expect(mini?.placement).toEqual({ areas: ['left', 'right'], singleton: true });

        // ── 명령 넷 — 옛 host.commands.add 와 같은 id 집합 + 제목 ──
        const cmds = listCommands()
            .filter((c) => c.id.startsWith('calendar.'))
            .map((c) => c.id)
            .sort();
        expect(cmds).toEqual(['calendar.newEventIn', 'calendar.open', 'calendar.openMini', 'calendar.openStore']);
        expect(getCommand('calendar.open')?.title).toBe('달력 열기');
        expect(getCommand('calendar.openStore')?.title).toBe('달력에서 열기');
        expect(getCommand('calendar.newEventIn')?.title).toBe('새 일정');
        expect(getCommand('calendar.openMini')?.title).toBe('작은 달력 열기(오른쪽 패널)');

        // ── 리본 둘 — 명령을 가리킨다(옛 host.ribbon.add 와 같은 commandId·순서) ──
        const ribbon = listRibbonActions()
            .filter((a) => a.id.startsWith('calendar.'))
            .map((a) => a.id)
            .sort();
        expect(ribbon).toEqual(['calendar.open', 'calendar.openMini']);

        // ── 설정 섹션 하나 + 항목 하나(옛 host.settings.addSection/addItem 와 같은 id·제목) ──
        const sec = listSettings().find((s) => s.id === 'calendar');
        expect(sec?.title).toBe('달력');
        expect(sec?.items.map((i) => i.id)).toEqual(['calendar']);
        expect(sec?.items.map((i) => i.title)).toEqual(['보기']);
    });
});
