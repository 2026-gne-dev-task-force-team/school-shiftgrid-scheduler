/**
 * 낱말 밑줄 — <Term id="hard">필수 위반</Term> 처럼 감싸면 점선 밑줄이 붙고,
 * 누르면 그 용어의 한 문장 설명이 뜨고 「자세히」로 도움말 서랍의 「용어」 탭이 열린다.
 */
import { useEffect, useRef, useState } from 'react';
import { glossaryById } from './terms';
import { useHelp } from './HelpContext';

export function Term({ id, children }: { id: string; children: React.ReactNode }) {
    const entry = glossaryById(id);
    const help = useHelp();
    const [open, setOpen] = useState(false);
    const [up, setUp] = useState(false);   // 화면 아래(상태줄)에서는 위로 펼친다 — 아래로 펼치면 화면 밖이다
    const ref = useRef<HTMLSpanElement>(null);
    const show = (v: boolean) => {
        if (v && ref.current) setUp(ref.current.getBoundingClientRect().bottom + 160 > window.innerHeight);
        setOpen(v);
    };

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        window.addEventListener('mousedown', h);
        return () => window.removeEventListener('mousedown', h);
    }, [open]);

    // 사전에 없는 id 면 밑줄만 없이 글자 그대로
    if (!entry) return <span>{children}</span>;

    return (
        <span ref={ref} className="relative inline-block">
            <button type="button" onMouseEnter={() => show(true)} onClick={() => show(!open)}
                className="border-b border-dotted border-muted/70 hover:border-accent text-inherit cursor-help"
                aria-label={`${entry.word} 뜻 보기`}>
                {children}
            </button>
            {open && (
                <span className={`absolute z-[120] left-0 ${up ? 'bottom-6' : 'top-6'} w-64 max-w-[80vw] p-2.5 rounded-md bg-panel border border-line shadow-xl text-[12px] text-text font-normal text-left leading-snug block`}>
                    <span className="block font-semibold mb-1">{entry.word}</span>
                    <span className="block text-muted">{entry.short}</span>
                    <button type="button"
                        onClick={() => { setOpen(false); help.openDrawer('glossary', id); }}
                        className="mt-1.5 text-accenth hover:underline">자세히 보기 →</button>
                </span>
            )}
        </span>
    );
}
