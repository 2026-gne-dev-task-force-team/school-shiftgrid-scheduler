/**
 * 우클릭 메뉴 대상 — 전역 menuTarget 없이 항목이 싣는다. 명령을 실제로 실행해 잰다:
 *   A 에서 메뉴를 연 뒤 B 의 메뉴를 열어도(전역 같으면 B 로 덮인다) A 항목을 실행하면 A 가 열린다.
 */
import { describe, it, expect, vi } from 'vitest';
import type { NodesApi } from '../explorer/contracts/nodes';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import pagePlugin from './index';
import { pageMenu, initPageNodes } from './nodes';

describe('페이지 우클릭 메뉴 — 대상은 항목이 싣는다', () => {
    it('A 메뉴 → B 메뉴를 연 뒤 A 항목 실행 = A 를 연다', () => {
        const open = vi.fn();
        initPageNodes({ open, subscribe: () => () => {} } as unknown as NodesApi);
        const menuA = pageMenu('A');
        pageMenu('B');
        const item = menuA[0] as { commandId: string; commandArg: { nodeId: string } };
        const run = (pagePlugin.commands as Record<string, (h: PluginHost, c?: CommandContext) => void>)[item.commandId];
        run({} as PluginHost, { nodeId: item.commandArg.nodeId } as CommandContext);
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith('A');
    });
});
