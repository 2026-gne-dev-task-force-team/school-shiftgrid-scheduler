// @vitest-environment jsdom
// 자동완성 목록 구조 시험 — jsdom 은 레이아웃을 못 재니 「표 컨테이너 밖에 렌더되는가·항목 수」만 본다.
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, createRef } from 'react';
import { SuggestList } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const 기본교과 = ['국어', '수학', '사회', '과학', '영어', '음악', '미술', '체육', '도덕', '실과', '창체', '통합', '안전', '기타'];
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; });

function 그리기(items: string[]) {
    const host = document.createElement('div');
    host.id = 'table-container'; host.style.overflow = 'auto';
    document.body.appendChild(host);
    const ref = createRef<HTMLInputElement>();
    root = createRoot(host);
    act(() => { root!.render(<div><input ref={ref} /><SuggestList anchor={ref} items={items} sugIdx={0} onPick={() => {}} /></div>); });
    return host;
}

describe('SuggestList', () => {
    it('빈 입력 포커스 때 기본 교과 14개가 다 렌더된다', () => {
        그리기(기본교과);
        expect(document.querySelectorAll('[data-suggest-list] [role=option]').length).toBe(14);
    });
    it('목록은 표 컨테이너(overflow 층) 밖 body 에 렌더된다', () => {
        const host = 그리기(기본교과);
        const list = document.querySelector('[data-suggest-list]')!;
        expect(list).not.toBeNull();
        expect(host.contains(list)).toBe(false);
        expect((list as HTMLElement).style.position).toBe('fixed');
    });
    it('항목이 없으면 아무것도 그리지 않는다', () => {
        그리기([]);
        expect(document.querySelector('[data-suggest-list]')).toBeNull();
    });
});
