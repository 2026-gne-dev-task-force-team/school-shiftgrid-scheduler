// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StartScreen } from './StartScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; });

function text(newLabel: string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => createRoot(host).render(createElement(StartScreen, { icon: 'file', title: 't', noun: '페이지', newLabel, items: [], onNew() {}, onOpen() {} })));
    return host.textContent ?? '';
}

describe('StartScreen 빈 상태 안내 조사', () => {
    it('받침 없으면 「로」, 있으면 「으로」, ㄹ 받침은 「로」', () => {
        expect(text('새 페이지')).toContain('「새 페이지」로 시작');
        expect(text('새 컬렉션')).toContain('「새 컬렉션」으로 시작'.replace('으로', '으로'));
        expect(text('새 표')).toContain('「새 표」로 시작');
        expect(text('만들기 시작')).toContain('「만들기 시작」으로 시작');
    });
});
