import { describe, expect, it } from 'vitest';
import { opsSubPlugin } from './index';

describe('보결 리본', () => {
    it('리본 줄은 「보결」 하나이고 누르면 보결 화면이 열린다', () => {
        const c = opsSubPlugin.manifest.contributes!;
        expect(c.ribbon!.map((r) => r.commandId)).toEqual(['ops-sub.open']);
        let opened = '';
        opsSubPlugin.commands!['ops-sub.open']({ workspace: { open: (id: string) => { opened = id; } } } as never);
        expect(opened).toBe('ops-sub.home');
    });
});
