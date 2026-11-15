// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { demoPart, memoryRoomSource, setRoomSource, setViewer, getRoomSource } from '../book';
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

describe('방 관리 화면 — 체험 역할 전환', () => {
    const teacher = { loggedIn: true, projectId: 'p1', userId: 'u-demo', role: '교사' as const };
    afterEach(() => setViewer(teacher));
    it('mock 이면 버튼이 보이고 누르면 고정 사용 불러오기가 보인다', async () => {
        setViewer(teacher);
        const host = await mount({});
        expect(host.textContent).not.toContain('고정 사용 불러오기');
        await click(host, '체험: 교무로 보기');
        expect(host.textContent).toContain('고정 사용 불러오기');
        await click(host, '교사로 돌아가기');
        expect(host.textContent).toContain('교무·교감·관리자만');
    });
    it('mock 이 아니면(진짜 자료 꽂힘) 버튼이 없다', async () => {
        const orig = getRoomSource();
        setRoomSource(memoryRoomSource(demoPart()));
        try {
            setViewer(teacher);
            const host = await mount({});
            expect(host.textContent).toContain('교무·교감·관리자만');
            expect(host.textContent).not.toContain('체험: 교무로 보기');
        } finally { setRoomSource(orig); }
    });
});

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
        expect((await src.loadPart()).rooms.map((r) => r.name)).toContain('미술실'); // 첫 눌림은 되묻기만
        expect(host.textContent).toContain('정말 지울까요?');
        await click(host, '미술실 지우기 확인');
        expect((await src.loadPart()).rooms.map((r) => r.name)).not.toContain('미술실');

        await type(host.querySelector('textarea') as HTMLTextAreaElement, 'id,name,capacity,resourceKey,active,sort,note\n,음악실,3,,true,5,\n,망가진,0,,true,6,\n');
        await click(host, '미리보기');
        expect(host.textContent).toContain('3줄: 정원은 1~20');
        expect(host.textContent).toContain('넣을 방 1');
        await click(host, '불러오기');
        expect((await src.loadPart()).rooms.map((r) => r.name)).toContain('음악실');
    });
    it('지우기 취소하면 그대로 남고, 줄·폼은 줄바꿈 클래스가 걸려 있다', async () => {
        const src = memoryRoomSource(demoPart());
        const host = await mount({ source: src, viewer: mgr });
        const n = (await src.loadPart()).rooms.length;
        const first = (await src.loadPart()).rooms[0].name;
        await click(host, `${first} 지우기`);
        await click(host, '지우기 취소');
        expect((await src.loadPart()).rooms.length).toBe(n);
        expect(host.textContent).not.toContain('정말 지울까요?');
        for (const el of host.querySelectorAll('[data-testid=room-row],[data-testid=form-row]')) expect(el.className).toContain('flex-wrap');
        expect(host.querySelectorAll('[data-testid=form-row]').length).toBe(2);
    });
    it('방 더하기만 파란 주 단추, 나머지는 테두리 보조 꼴', async () => {
        const host = await mount({ source: memoryRoomSource(demoPart()), viewer: mgr });
        const btn = (t: string) => [...host.querySelectorAll('button')].find((x) => x.textContent === t) as HTMLButtonElement;
        expect(btn('방 더하기').className).toContain('bg-accent');
        for (const t of ['차단 더하기', 'CSV 내보내기', '미리보기', '고정 사용 불러오기']) { expect(btn(t).className).toContain('border-line'); expect(btn(t).className).not.toContain('border-transparent'); }
    });
    const pickFile = async (host: HTMLElement, text: string) => {
        const input = host.querySelector('input[type=file]') as HTMLInputElement;
        const file = new File([text], 'a.csv');
        (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer = async () => new TextEncoder().encode(text).buffer as ArrayBuffer; // jsdom File 에 없다
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
        return text;
    };
    const csv = '요일,시각,과학실\r\n월,09:00~09:40,5-3 과학\r\n';
    it('고정 사용 불러오기 화면이 열리고, 반영하면 저장되어 다시 읽힌다', async () => {
        const src = memoryRoomSource(demoPart());
        const host = await mount({ source: src, viewer: mgr, newId: () => 'n1' });
        await click(host, '고정 사용 불러오기');
        expect(host.querySelector('input[type=file]')).not.toBeNull();
        expect(host.textContent).not.toContain('방 더하기');
        await pickFile(host, csv);
        await click(host, '이대로 반영');
        const part = await src.loadPart();
        expect(part.fixed.map((f) => [f.roomId, f.label])).toEqual([['r-sci', '5-3 과학']]);
        await click(host, '돌아가기');
        expect(host.textContent).toContain('방 더하기');
    });
    it('겹침이면 저장이 안 바뀐다', async () => {
        const part = demoPart();
        const f = { id: 'f1', roomId: 'r-yard', dayIndex: 0, startMin: 540, endMin: 580, label: 'x' };
        part.fixed = [f, { ...f, id: 'f2' }];
        const src = memoryRoomSource(part);
        const host = await mount({ source: src, viewer: mgr, newId: () => 'n1' });
        await click(host, '고정 사용 불러오기');
        await pickFile(host, csv);
        await click(host, '이대로 반영');
        expect(host.textContent).toContain('겹칩니다');
        expect((await src.loadPart()).fixed.map((x) => x.id)).toEqual(['f1', 'f2']);
    });
});
