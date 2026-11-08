/**
 * 마크다운 — 줄 앞 단축 변환(각 종류) · 인라인 서식/토글 · 내보내기↔붙여넣기 왕복(명세 요구 3·4·9).
 */
import { describe, it, expect } from 'vitest';
import {
    detectBlockShortcut, parseInline, toggleMark, exportMarkdown, parseMarkdown,
} from './markdown';
import type { Page } from './types';

describe('줄 앞 단축 변환 — 각 종류(요구 3)', () => {
    it('제목 1~3', () => {
        expect(detectBlockShortcut('# 제목')).toEqual({ type: 'heading1', rest: '제목' });
        expect(detectBlockShortcut('## 제목')).toEqual({ type: 'heading2', rest: '제목' });
        expect(detectBlockShortcut('### 제목')).toEqual({ type: 'heading3', rest: '제목' });
    });
    it('글머리표 - 와 *', () => {
        expect(detectBlockShortcut('- 하나')).toEqual({ type: 'bulleted', rest: '하나' });
        expect(detectBlockShortcut('* 둘')).toEqual({ type: 'bulleted', rest: '둘' });
    });
    it('번호 목록', () => {
        expect(detectBlockShortcut('1. 첫째')).toEqual({ type: 'numbered', rest: '첫째' });
        expect(detectBlockShortcut('3. 셋째')).toEqual({ type: 'numbered', rest: '셋째' });
    });
    it('체크 [] [ ] [x]', () => {
        expect(detectBlockShortcut('[] 할 일')).toEqual({ type: 'todo', rest: '할 일', checked: false });
        expect(detectBlockShortcut('[ ] 할 일')).toEqual({ type: 'todo', rest: '할 일', checked: false });
        expect(detectBlockShortcut('[x] 끝남')).toEqual({ type: 'todo', rest: '끝남', checked: true });
    });
    it('인용·코드·구분선', () => {
        expect(detectBlockShortcut('> 인용')).toEqual({ type: 'quote', rest: '인용' });
        expect(detectBlockShortcut('```')).toEqual({ type: 'code', rest: '' });
        expect(detectBlockShortcut('---')).toEqual({ type: 'divider', rest: '' });
    });
    it('안 맞으면 null(그대로 문단)', () => {
        expect(detectBlockShortcut('그냥 글')).toBeNull();
        expect(detectBlockShortcut('#제목아님')).toBeNull();     // 공백 없음
        expect(detectBlockShortcut('-목록아님')).toBeNull();
    });
});

describe('인라인 서식 파싱(요구 4)', () => {
    it('굵게·기울임·코드·취소', () => {
        expect(parseInline('**굵게**')).toEqual([{ text: '굵게', bold: true }]);
        expect(parseInline('*기울임*')).toEqual([{ text: '기울임', italic: true }]);
        expect(parseInline('`코드`')).toEqual([{ text: '코드', code: true }]);
        expect(parseInline('~~취소~~')).toEqual([{ text: '취소', strike: true }]);
    });
    it('섞인 글 — 앞뒤 일반 글자와 함께', () => {
        expect(parseInline('앞 **굵게** 뒤')).toEqual([
            { text: '앞 ' }, { text: '굵게', bold: true }, { text: ' 뒤' },
        ]);
    });
    it('코드 안에서는 다른 마커를 글자 그대로', () => {
        expect(parseInline('`a**b**c`')).toEqual([{ text: 'a**b**c', code: true }]);
    });
    it('서식 없는 글은 한 조각', () => {
        expect(parseInline('그냥 글')).toEqual([{ text: '그냥 글' }]);
    });
});

describe('인라인 토글 — ⌘B/⌘I 자리(요구 4)', () => {
    it('고른 범위를 감싼다', () => {
        const r = toggleMark('가나다', 0, 3, '**');
        expect(r.text).toBe('**가나다**');
        expect(r.text.slice(r.start, r.end)).toBe('가나다');
    });
    it('이미 바깥이 감싸여 있으면 벗긴다', () => {
        const r = toggleMark('**가나다**', 2, 5, '**');
        expect(r.text).toBe('가나다');
        expect(r.text.slice(r.start, r.end)).toBe('가나다');
    });
    it('안쪽이 감싸여 있어도 벗긴다', () => {
        const r = toggleMark('**가나다**', 0, 7, '**');
        expect(r.text).toBe('가나다');
    });
});

describe('내보내기 ↔ 붙여넣기 왕복(요구 9)', () => {
    const page: Page = {
        blocks: [
            { id: 'a', type: 'heading1', text: '제목' },
            { id: 'b', type: 'paragraph', text: '문단 글' },
            { id: 'c', type: 'bulleted', text: '하나', indent: 0 },
            { id: 'd', type: 'bulleted', text: '둘', indent: 1 },
            { id: 'e', type: 'numbered', text: '첫째', indent: 0 },
            { id: 'f', type: 'numbered', text: '둘째', indent: 0 },
            { id: 'g', type: 'todo', text: '할 일', checked: false },
            { id: 'h', type: 'todo', text: '끝남', checked: true },
            { id: 'i', type: 'quote', text: '인용문' },
            { id: 'j', type: 'divider', text: '' },
            {
                id: 'k', type: 'table', text: '',
                table: { columns: [{ key: 'c1', title: '이름' }, { key: 'c2', title: '값' }], rows: [{ id: 'r1', cells: { c1: '가', c2: '1' } }] },
            },
        ],
    };

    it('번호 목록은 이어진 묶음 안에서 1,2 로 센다', () => {
        const md = exportMarkdown(page);
        expect(md).toContain('1. 첫째');
        expect(md).toContain('2. 둘째');
    });

    it('표는 GFM 로 나간다', () => {
        const md = exportMarkdown(page);
        expect(md).toContain('| 이름 | 값 |');
        expect(md).toContain('| --- | --- |');
        expect(md).toContain('| 가 | 1 |');
    });

    it('내보낸 마크다운을 다시 읽으면 블록 종류·글자가 보존된다', () => {
        const md = exportMarkdown(page);
        const back = parseMarkdown(md);
        const shape = back.map((b) => ({ type: b.type, text: b.text, checked: b.checked }));
        expect(shape).toEqual([
            { type: 'heading1', text: '제목', checked: undefined },
            { type: 'paragraph', text: '문단 글', checked: undefined },
            { type: 'bulleted', text: '하나', checked: undefined },
            { type: 'bulleted', text: '둘', checked: undefined },
            { type: 'numbered', text: '첫째', checked: undefined },
            { type: 'numbered', text: '둘째', checked: undefined },
            { type: 'todo', text: '할 일', checked: false },
            { type: 'todo', text: '끝남', checked: true },
            { type: 'quote', text: '인용문', checked: undefined },
            { type: 'divider', text: '', checked: undefined },
            { type: 'table', text: '', checked: undefined },
        ]);
    });

    it('들여쓴 목록의 깊이도 왕복에서 살아남는다', () => {
        const md = exportMarkdown(page);
        const back = parseMarkdown(md);
        const bullets = back.filter((b) => b.type === 'bulleted');
        expect(bullets.map((b) => b.indent)).toEqual([0, 1]);
    });

    it('표 내용이 왕복에서 살아남는다', () => {
        const md = exportMarkdown(page);
        const back = parseMarkdown(md);
        const t = back.find((b) => b.type === 'table');
        expect(t?.table?.columns.map((c) => c.title)).toEqual(['이름', '값']);
        expect(t?.table?.rows[0].cells).toMatchObject({ c1: '가', c2: '1' });
    });

    it('여러 줄 붙여넣기 — 빈 줄은 건너뛰고 코드 울타리를 묶는다', () => {
        const md = '첫 줄\n\n```\ncode line\n```\n둘째 줄';
        const back = parseMarkdown(md);
        expect(back.map((b) => b.type)).toEqual(['paragraph', 'code', 'paragraph']);
        expect(back[1].text).toBe('code line');
    });
});
