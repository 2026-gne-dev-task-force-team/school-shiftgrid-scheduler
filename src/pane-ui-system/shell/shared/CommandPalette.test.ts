/**
 * 명령 팔레트 거르기(S7) — palette:false·지금 안 되는 명령은 빠지고, 영문 id 로는 안 걸리며 사람 이름(제목·꾸러미 이름)으로만 걸린다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { paletteCommands } from './CommandPalette';
import { addCommand, listCommands } from '../../plugin/store';

const offs: { dispose(): void }[] = [];
afterEach(() => { while (offs.length) offs.pop()!.dispose(); });
const names = (o: string) => (o === 'pk' ? '탐색기' : '');

describe('paletteCommands', () => {
    it('palette:false · enabled=false 는 빠진다', () => {
        offs.push(addCommand('pk', { id: 'pk.rename', title: '이름 바꾸기', run: () => {} }));
        offs.push(addCommand('pk', { id: 'pk.confirm', title: '삭제 확인', run: () => {}, palette: false }));
        offs.push(addCommand('pk', { id: 'pk.off', title: '꺼진 것', run: () => {}, enabled: () => false }));
        const ids = paletteCommands(listCommands(), '', names).map((c) => c.id);
        expect(ids).toContain('pk.rename');
        expect(ids).not.toContain('pk.confirm');
        expect(ids).not.toContain('pk.off');
    });

    it('영문 내부 id 로는 안 걸리고, 제목·꾸러미 이름으로 걸린다', () => {
        offs.push(addCommand('pk', { id: 'pk.open-panel', title: '패널 열기', run: () => {} }));
        expect(paletteCommands(listCommands(), 'open-panel', names)).toHaveLength(0);
        expect(paletteCommands(listCommands(), '패널', names).map((c) => c.id)).toEqual(['pk.open-panel']);
        expect(paletteCommands(listCommands(), '탐색기', names).map((c) => c.id)).toEqual(['pk.open-panel']);
    });
});
