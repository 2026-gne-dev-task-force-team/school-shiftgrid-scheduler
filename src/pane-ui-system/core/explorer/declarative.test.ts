/**
 * 선언형 전환 증명(D2) — 탐색기를 선언형(definePlugin + contributes)으로 켜도 **옛 집합과 같다**.
 *   ① 실 플러그인을 activateAll 로 켜면 뷰1·명령18(16 선언 + new-folder·new-section 자동)·리본1·상태바1 이 옛 그대로 선다
 *   ② 노드 타입 folder 가 contributes.nodeTypes 로 꽂힌다(onActivate 는 이제 registerType 을 안 부른다 → 켜졌으면 레지스트라 경로다)
 *      + 그 덕에 registerTypeCommands 가 new-folder 를 자동으로 켠다(순서 보존)
 *
 *   🔴 store 가 비동기 로드(kv)라 kv 를 메모리로 모킹한다(new-node-command.test 와 같은 결) — 등록만 보니 초기화는 비워도 된다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../kv', () => ({
    kvGet: vi.fn(async () => null),
    kvSet: vi.fn(async () => true),
    kvDel: vi.fn(async () => { /* 없음 */ }),
    kvAvailable: vi.fn(async () => true),
    kvEstimate: vi.fn(async () => null),
    nodesGetAll: vi.fn(async () => [] as unknown[]),
    nodesWrite: vi.fn(async () => true),
}));

import { activateAll, listPlugins } from '../../plugin/registry';
import { disposeOwner, listCommands, listRibbonActions, listStatusItems } from '../../plugin/store';
import { getView, clearViews } from '../../view-registry';
import { isKnownType, clearTypes } from '../nodes/model/types';
import { clearDerived } from '../nodes/model/derive';
import { __resetPersistForTest } from '../node-store/persist';
import { explorerPlugin } from './index';   // 🔴 꾸러미 전환 — 탐색기 꾸러미가 nodes 약속을 들고 온다(contributes.interfaces), 별도 contract-nodes 없음

const OWNER = 'explorer';

/** 옛(호출형) 집합과 같아야 하는 명령 18 — 16 선언 + folder·section 타입이 자동으로 켜는 new-folder·new-section.
 *   (16 = 옛 14 + confirmDelete 인라인 확인 둘: confirm-remove·cancel-remove.) */
const EXPECTED_COMMANDS = [
    'explorer.open-panel', 'explorer.rename', 'explorer.remove',
    'explorer.confirm-remove', 'explorer.cancel-remove',
    'explorer.open', 'explorer.move-up', 'explorer.move-down',
    'explorer.restore', 'explorer.ask-purge', 'explorer.ask-purge-all',
    'explorer.purge', 'explorer.purge-all', 'explorer.cancel-purge',
    'explorer.undo', 'explorer.redo', 'explorer.new-folder', 'explorer.new-section',
].sort();

beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom 없을 때 */ }
    disposeOwner(OWNER); clearViews(); clearTypes(); clearDerived(); __resetPersistForTest();
});
afterEach(() => { disposeOwner(OWNER); clearTypes(); __resetPersistForTest(); });

describe('① 선언형으로 켜도 뷰·명령·리본·상태바가 옛 집합과 같다', () => {
    it('명령 18(16 선언 + new-folder·new-section) · 뷰 tree · 리본 open-panel · 상태바 count', () => {
        activateAll([explorerPlugin]);

        const cmds = listCommands().filter((c) => c.owner === OWNER).map((c) => c.id).sort();
        expect(cmds, '명령 집합이 옛 그대로(18)').toEqual(EXPECTED_COMMANDS);

        expect(getView('explorer.tree'), '뷰가 접두사 붙어 등록').toBeTruthy();
        expect(listRibbonActions().some((a) => a.id === 'explorer.open-panel'), '리본이 open-panel 을 가리킴').toBe(true);
        expect(listStatusItems().some((s) => s.owner === OWNER && s.id === 'count'), '상태바 count').toBe(true);

        expect(listPlugins().find((p) => p.id === OWNER)?.failed, '활성 실패 아님').toBe(false);
    });
});

describe('② folder 노드 타입은 contributes.nodeTypes 로 꽂힌다(레지스트라 경로)', () => {
    it('켜면 folder 가 등록되고(onActivate 는 registerType 을 안 부른다) new-folder 가 자동으로 선다', () => {
        activateAll([explorerPlugin]);

        expect(isKnownType('folder'), 'folder 가 레지스트리에 있다 = contributes→registerContributed 로 꽂혔다').toBe(true);
        const cmds = listCommands().filter((c) => c.owner === OWNER).map((c) => c.id);
        expect(cmds, 'folder.create 가 있어 new-folder 명령이 자동 등록').toContain('explorer.new-folder');
    });
});
