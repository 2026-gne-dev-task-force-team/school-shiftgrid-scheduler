/**
 * 인라인 서식 그리기 — 포커스 밖 블록은 마크다운을 서식으로 보여 준다(편집 중엔 원본 글자를 쓴다).
 *   ⛔ 색은 토큰 클래스만(구조 검사 ①).
 */
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { parseInline } from '../core/markdown';

export function InlineText({ text }: { text: string }) {
    if (text === '') return <span className="text-muted">　</span>;
    const spans = parseInline(text);
    return (
        <>
            {spans.map((s, i) => {
                let node: ReactNode = s.text;
                if (s.code) node = <code key="c" className="px-1 rounded bg-text/[0.06] text-[0.9em]">{s.text}</code>;
                if (s.bold) node = <strong>{node}</strong>;
                if (s.italic) node = <em>{node}</em>;
                if (s.strike) node = <s>{node}</s>;
                return <Fragment key={i}>{node}</Fragment>;
            })}
        </>
    );
}
