import { describe, expect, it } from 'vitest';
import { opsRoomPlugin } from './index';

describe('ops-room 관리 화면 가는 길', () => {
    it('리본에 「특별실 관리 열기」 가 있고 그 명령이 관리 화면을 연다', () => {
        const c = opsRoomPlugin.manifest.contributes!;
        expect(c.ribbon!.map((r) => r.commandId)).toContain('ops-room.open-manage');
        expect(c.commands!.map((x) => x.id)).toContain('ops-room.open-manage');
        let opened = '';
        opsRoomPlugin.commands!['ops-room.open-manage']({ workspace: { open: (id: string) => { opened = id; } } } as never);
        expect(opened).toBe('ops-room.manage');
        expect(c.views!.find((v) => v.id === 'manage')).toBeTruthy();
    });
});
