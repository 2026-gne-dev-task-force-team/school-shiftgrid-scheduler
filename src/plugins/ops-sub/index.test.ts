import { describe, expect, it } from 'vitest';
import { opsSubPlugin } from './index';

describe('보결 리본', () => {
    it('「보결 목록」 리본 버튼이 있고 누르면 목록이 열린다', () => {
        const c = opsSubPlugin.manifest.contributes!;
        expect(c.ribbon!.map((r) => r.commandId)).toContain('ops-sub.open-list');
        let opened = '';
        opsSubPlugin.commands!['ops-sub.open-list']({ workspace: { open: (id: string) => { opened = id; } } } as never);
        expect(opened).toBe('ops-sub.list');
    });
});
