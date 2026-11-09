/**
 * 명령 통로(R2) — runCommand 가 맥락(leafId·nodeId·nodeIds·args)을 그대로 넘기고, enabled(ctx)=false 면 안 부른다.
 *   contributes 로 꽂은 명령도 impl.enabled 가 같은 키로 붙는다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { addCommand, runCommand, commandEnabled, getCommand } from './store';
import type { CommandContext } from './types';

const offs: { dispose(): void }[] = [];
afterEach(() => { while (offs.length) offs.pop()!.dispose(); });

describe('명령 맥락 · enabled', () => {
    it('ctx 의 nodeId·nodeIds·args 가 run 에 그대로 간다', () => {
        const run = vi.fn((_c?: CommandContext) => {});
        offs.push(addCommand('t', { id: 't.go', title: '가기', run }));
        const ctx: CommandContext = { nodeId: 'n1', nodeIds: ['n1', 'n2'], args: { k: [1, 'a', null] } };
        expect(runCommand('t.go', ctx)).toBe(true);
        expect(run).toHaveBeenCalledWith(ctx);
    });

    it('enabled(ctx) 가 false 면 안 부르고 false · 맞으면 부른다 · 판정이 던지면 false', () => {
        const run = vi.fn();
        offs.push(addCommand('t', { id: 't.tok', title: '토큰', run, enabled: (c) => c?.args === 3 }));
        expect(commandEnabled('t.tok', { args: 2 })).toBe(false);
        expect(runCommand('t.tok', { args: 2 })).toBe(false);
        expect(run).not.toHaveBeenCalled();
        expect(runCommand('t.tok', { args: 3 })).toBe(true);
        expect(run).toHaveBeenCalledTimes(1);
        offs.push(addCommand('t', { id: 't.boom', title: '터짐', run, enabled: () => { throw new Error('x'); } }));
        expect(commandEnabled('t.boom')).toBe(false);
        expect(commandEnabled('없는.명령')).toBe(false);
    });

    it('palette:false 는 데이터로 남는다(팔레트가 거른다)', () => {
        offs.push(addCommand('t', { id: 't.inner', title: '내부 단계', run: () => {}, palette: false }));
        expect(getCommand('t.inner')?.palette).toBe(false);
    });
});
