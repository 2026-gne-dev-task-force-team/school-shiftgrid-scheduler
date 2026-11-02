/**
 * pane-test 선언형 전환 증명(D4) — contributes 로 꽂힌 집합이 「옛 집합」과 같고, 상태바 render 가 host 를 받나.
 *
 * ⭐ 「옛 집합」은 아래 골든 리터럴이다(전환 전 onActivate 가 register/add 로 꽂던 것) — 독립 오라클이라
 *    새 contributes 가 뷰·명령·리본·설정·상태바 중 하나라도 빠뜨리거나 이름이 밀리면 여기서 잡힌다.
 * 🔴 상태바 가름의 본보기: open-count 는 늘 뜨니 선언(contributes.statusBar)으로 꽂히고,
 *    node-count 는 탐색기 api 가 있을 때만이라 onActivate 의 host.declare 로 — 탐색기 없는 이 테스트에선 안 떠야 맞다.
 * 🔴 상태바 render 가 host 를 받나: renders.OpenCount 를 탐침으로 바꿔 끼워, 등록된 render() 가 불릴 때
 *    pane-test 의 host(id)가 넘어오는지 본다(declareOne 이 `render: () => fn(host)` 로 감싼다).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getView, clearViews } from '../../pane-ui-system/view-registry';
import {
    activateAll, listPlugins, disposeOwner,
    getCommand, listRibbonActions, listSettings, listStatusItems,
} from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { paneTestPlugin } from './index';

// ── 옛 집합(골든) — 전환 전 onActivate 가 꽂던 그대로 ──
const SAMPLE_IDS = ['panel-a', 'panel-b', 'panel-c', 'panel-d', 'tab-ga', 'tab-na', 'tab-da', 'tab-ra', 'scroll'];
const GOLDEN_VIEWS = ['pane-test.console', ...SAMPLE_IDS.map((id) => `pane-test.${id}`)];
const GOLDEN_CMDS = ['pane-test.open', ...SAMPLE_IDS.map((id) => `pane-test.open-${id}`)];

beforeEach(() => {
    disposeOwner('pane-test');
    clearViews();
});
afterEach(() => {
    disposeOwner('pane-test');
    clearViews();
});

describe('D4 pane-test — contributes 집합이 옛 집합과 같다', () => {
    it('뷰 10개가 접두사 붙어 전부 꽂힌다(시험 탭 + 샘플 아홉)', () => {
        activateAll([paneTestPlugin]);
        for (const v of GOLDEN_VIEWS) expect(getView(v), `뷰 ${v}`).toBeTruthy();
        expect(listPlugins().find((p) => p.id === 'pane-test')?.failed, '활성 실패 아님').toBe(false);
    });

    it('명령 10개가 전부 꽂힌다(열기 + 샘플 아홉 열기)', () => {
        activateAll([paneTestPlugin]);
        for (const c of GOLDEN_CMDS) expect(getCommand(c), `명령 ${c}`).toBeTruthy();
    });

    it('리본은 pane-test.open 하나를 가리킨다', () => {
        activateAll([paneTestPlugin]);
        const ids = listRibbonActions().filter((a) => a.id.startsWith('pane-test')).map((a) => a.id);
        expect(ids).toEqual(['pane-test.open']);
    });

    it('설정은 섹션 pane-test · 항목 pane-test 하나', () => {
        activateAll([paneTestPlugin]);
        const sec = listSettings().find((s) => s.id === 'pane-test');
        expect(sec?.title).toBe('Pane UI Test');
        expect(sec?.items.map((i) => i.id)).toEqual(['pane-test']);
    });

    it('상태바는 open-count 하나만 — node-count 는 탐색기 없으면 안 뜬다(조건부 declare)', () => {
        activateAll([paneTestPlugin]);
        const ids = listStatusItems().filter((s) => s.owner === 'pane-test').map((s) => s.id);
        expect(ids).toEqual(['open-count']);
    });
});

describe('D4 pane-test — 상태바 render 가 host 를 받는다', () => {
    it('등록된 open-count render() 가 불릴 때 pane-test host 가 넘어온다', () => {
        // renders.OpenCount 를 탐침으로 바꿔 끼운다 — declareOne 이 `() => fn(host)` 로 감싸 꽂으므로 그 host 를 잡는다.
        const renders = paneTestPlugin.renders as Record<string, (host: PluginHost) => unknown>;
        const orig = renders.OpenCount;
        let captured: PluginHost | undefined;
        renders.OpenCount = (host: PluginHost) => { captured = host; return orig(host); };
        try {
            activateAll([paneTestPlugin]);
            const item = listStatusItems().find((s) => s.owner === 'pane-test' && s.id === 'open-count');
            expect(item, 'open-count 상태바가 꽂혔다').toBeTruthy();
            const node = item!.render();            // 꽂힌 render 를 부른다 → fn(host)
            expect(captured?.id, 'render 가 pane-test host 를 받는다').toBe('pane-test');
            expect(node, 'render 가 노드를 돌려준다').toBeTruthy();
        } finally {
            renders.OpenCount = orig;
        }
    });
});
