// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoPart, memoryRoomSource } from '../book';
import { RoomManageView } from './RoomManage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

const mgr = { loggedIn: true, projectId: 'p1', userId: 'u-m', role: '교무' as const };
const mount = async (props: Parameters<typeof RoomManageView>[0]) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => createRoot(host).render(createElement(RoomManageView, props)));
    return host;
};
const click = async (host: HTMLElement, label: string) => { await act(async () => { [...host.querySelectorAll('button')].find((x) => x.textContent === label)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

describe('방 관리 화면', () => {
    it('교사에겐 막혀 있다', async () => {
        const host = await mount({ source: memoryRoomSource(demoPart()), viewer: { ...mgr, role: '교사' } });
        expect(host.textContent).toContain('교무·교감·관리자만');
        expect(host.querySelector('button')).toBeNull();
    });
    it('방 더하기 → 지우기, CSV 미리보기는 거절 줄 번호를 보이고 불러오면 반영된다', async () => {
        const src = memoryRoomSource(demoPart());
        let k = 0;
        const host = await mount({ source: src, viewer: mgr, newId: () => `n${++k}` });
        await type(host.querySelectorAll('input')[4] as HTMLInputElement, '미술실');
        await click(host, '방 더하기');
        expect((await src.loadPart()).rooms.map((r) => r.name)).toContain('미술실');
        await click(host, '미술실 지우기');
        expect((await src.loadPart()).rooms.map((r) => r.name)).not.toContain('미술실');

        await type(host.querySelector('textarea') as HTMLTextAreaElement, 'id,name,capacity,resourceKey,active,sort,note\n,음악실,3,,true,5,\n,망가진,0,,true,6,\n');
        await click(host, '미리보기');
        expect(host.textContent).toContain('3줄: 정원은 1~20');
        expect(host.textContent).toContain('넣을 방 1');
        await click(host, '불러오기');
        expect((await src.loadPart()).rooms.map((r) => r.name)).toContain('음악실');
    });
});
