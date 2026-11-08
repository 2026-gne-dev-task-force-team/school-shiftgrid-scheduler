// @vitest-environment jsdom
/**
 * 인라인 DOM ↔ 마크다운, 캐럿 소스 오프셋 저장·복원(명세 P2 요구 1·2).
 *   순수 걷기 함수(sourceOffsetAt·domPosForSource)는 node/offset 을 직접 넘겨 Selection 없이 검사한다.
 */
import { describe, it, expect } from 'vitest';
import {
    serializeInline, buildInlineDom, inlineDomMatches, sourceOffsetAt, domPosForSource, resolveCaretHost,
} from './caret';

function div(text: string): HTMLDivElement {
    const el = document.createElement('div');
    buildInlineDom(el, text);
    return el;
}

describe('인라인 DOM ↔ 마크다운', () => {
    it('완성된 마커는 서식 엘리먼트로', () => {
        expect(div('**굵게**').querySelector('strong')?.textContent).toBe('굵게');
        expect(div('*기울임*').querySelector('em')?.textContent).toBe('기울임');
        expect(div('`코드`').querySelector('code')?.textContent).toBe('코드');
        expect(div('~~취소~~').querySelector('s')?.textContent).toBe('취소');
    });

    it('미완성·빈 마커는 글자 그대로(치는 중)', () => {
        const d = div('**굵게');
        expect(d.querySelector('strong')).toBeNull();
        expect(d.textContent).toBe('**굵게');
        expect(div('``').textContent).toBe('``');
        expect(div('****').textContent).toBe('****');
    });

    it('serialize(build(text)) === text (왕복)', () => {
        for (const t of ['**굵게**', '앞 **굵게** 뒤', '*a*`b`', '**굵게', '그냥 글', '`a**b**c`']) {
            expect(serializeInline(div(t))).toBe(t);
        }
    });

    it('inlineDomMatches — 리터럴 "**b**" 는 strong 구조와 다르다(= 변환해야 한다)', () => {
        const el = document.createElement('div');
        el.appendChild(document.createTextNode('**b**'));
        expect(inlineDomMatches(el, '**b**')).toBe(false);   // 🔴 닫는 기호 입력 → 즉시 변환 신호
        buildInlineDom(el, '**b**');
        expect(inlineDomMatches(el, '**b**')).toBe(true);    // 다시 그린 뒤엔 같다(안 건드린다)
    });

    it('inlineDomMatches — 평문 입력은 구조가 같다(다시 안 그린다)', () => {
        const el = div('abc');
        (el.firstChild as Text).data = 'abxc';               // 평문 한 글자 추가(브라우저가 한 것처럼)
        expect(inlineDomMatches(el, 'abxc')).toBe(true);
    });
});

describe('캐럿 소스 오프셋 저장·복원', () => {
    it('평문 블록 — 오프셋 그대로 왕복', () => {
        const el = div('가나다');
        const tn = el.firstChild as Text;
        expect(sourceOffsetAt(el, tn, 2)).toBe(2);
        const pos = domPosForSource(el, 2);
        expect(pos.node).toBe(tn);
        expect(pos.offset).toBe(2);
    });

    it('굵게 — 닫는 마커 뒤(변환 직후)는 바깥·안쪽 끝은 안(노션 동작)', () => {
        const el = div('**bold**');                 // <strong>bold</strong>
        const strong = el.querySelector('strong')!;
        const inner = strong.firstChild as Text;
        // 소스 '**bold**' : [0,2)='**' · [2,6)='bold' · [6,8)='**'
        // 안쪽 끝(6) → strong 안 글자 끝 (굵게로 이어진다)
        const inside = domPosForSource(el, 6);
        expect(inside.node).toBe(inner);
        expect(inside.offset).toBe(4);
        // 바깥(8) → el 레벨, strong 다음 (평문으로 이어진다)
        const after = domPosForSource(el, 8);
        expect(after.node).toBe(el);
        expect(after.offset).toBe(1);
        // 역방향도 구분된다
        expect(sourceOffsetAt(el, inner, 4)).toBe(6);   // 안쪽 끝
        expect(sourceOffsetAt(el, el, 1)).toBe(8);      // 바깥
    });

    it('섞인 블록 — 앞 글자 + 굵게 + 뒤 글자', () => {
        const el = div('앞 **굵게** 뒤');            // text"앞 " strong"굵게" text" 뒤"
        // 소스: '앞 '=[0,2) '**'=[2,4) '굵게'=[4,6) '**'=[6,8) ' 뒤'=[8,10)
        const tail = el.childNodes[2] as Text;
        expect(tail.textContent).toBe(' 뒤');
        const pos = domPosForSource(el, 9);           // ' 뒤'의 둘째 글자 앞
        expect(pos.node).toBe(tail);
        expect(pos.offset).toBe(1);
        expect(sourceOffsetAt(el, tail, 1)).toBe(9);
    });
});

describe('🔴 변환 직후 다음 글자는 평문 — 서식 뒤 캐럿 홀더(결함 수정)', () => {
    it('서식 뒤(바깥)에 캐럿을 놓으면 빈 텍스트 노드가 생기고, 친 글자는 서식 밖 평문이다', () => {
        const el = div('**굵게**');                  // [strong]
        expect(el.childNodes.length).toBe(1);
        const h = resolveCaretHost(el, el, 1);        // strong 바로 뒤(바깥)
        expect(h.node.nodeType).toBe(Node.TEXT_NODE);
        expect(h.node.parentNode).toBe(el);
        expect(h.offset).toBe(0);
        expect(el.childNodes.length).toBe(2);         // strong + 빈 홀더
        // 홀더에 글자를 치면(브라우저가 하듯) 굵게가 번지지 않고 평문으로 이어진다
        (h.node as Text).data = 'x';
        expect(serializeInline(el)).toBe('**굵게**x');
        expect(el.querySelector('strong')?.textContent).toBe('굵게');
    });

    it('빈 홀더는 왕복·매칭 어디에도 안 샌다(제로폭 문자 안 씀)', () => {
        const el = div('**굵게**');
        resolveCaretHost(el, el, 1);                  // 빈 홀더 추가
        expect(serializeInline(el)).toBe('**굵게**'); // 모델 값 그대로
        expect(inlineDomMatches(el, '**굵게**')).toBe(true); // 빈 홀더는 다시 그릴 신호 아님
    });

    it('이미 뒤에 평문 노드가 있으면 새로 끼우지 않는다', () => {
        const el = div('**굵게** 뒤');                // [strong, text" 뒤"]
        const h = resolveCaretHost(el, el, 1);        // strong 뒤 = 이미 text" 뒤"
        expect(el.childNodes.length).toBe(2);
        expect(h.node).toBe(el.childNodes[1]);
        expect(h.offset).toBe(0);
    });

    it('앞이 서식이 아니면(평문 뒤) 손대지 않는다', () => {
        const el = div('그냥 글');                     // [text]
        const h = resolveCaretHost(el, el, 1);
        expect(el.childNodes.length).toBe(1);
        expect(h.node).toBe(el);
        expect(h.offset).toBe(1);
    });
});
