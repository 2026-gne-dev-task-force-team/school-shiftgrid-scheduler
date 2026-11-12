/**
 * 낱말 밑줄 — <Term id="hard">필수 위반</Term> 처럼 감싸면 점선 밑줄이 붙고,
 * 누르거나 마우스를 올리면 그 용어 카드(낱말·한 문장·예·그림·자세히)가 뷰포트 인식 팝오버로 뜬다.
 * 호버로 열리고, 열린 뒤엔 마우스가 나가도 안 닫힌다. 바깥 클릭·Esc 로 닫힌다(Popover 가 맡는다).
 */
import { useRef, useState } from 'react';
import { glossaryById } from './terms';
import { useHelp } from './HelpContext';
import { Popover } from './Popover';
import { Figure } from './figures/Figure';

export function Term({ id, children }: { id: string; children: React.ReactNode }) {
    const entry = glossaryById(id);
    const help = useHelp();
    const [open, setOpen] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    // 사전에 없는 id 면 밑줄 없이 글자 그대로
    if (!entry) return <span>{children}</span>;

    const ex = entry.example == null ? undefined
        : Array.isArray(entry.example) ? entry.example.join(', ') : entry.example;

    return (
        <span className="relative inline-block">
            <button ref={btnRef} type="button" onMouseEnter={() => setOpen(true)} onClick={() => setOpen((v) => !v)}
                className="border-b border-dotted border-muted/70 hover:border-accent text-inherit cursor-help"
                aria-label={`${entry.word} 뜻 보기`}>
                {children}
            </button>
            <Popover anchorRef={btnRef} open={open} onClose={() => setOpen(false)} width={300}>
                <div className="p-2.5 text-left">
                    <div className="text-[13px] font-semibold mb-1">{entry.word}</div>
                    <div className="text-[12px] text-muted leading-snug">{entry.short}</div>
                    {ex && (
                        <div className="mt-1.5 text-[12px] leading-snug">
                            <span className="text-muted mr-1">예</span><span className="text-text">{ex}</span>
                        </div>
                    )}
                    {entry.figure && <Figure id={entry.figure} className="mt-2 rounded-md border border-line bg-panel2 p-1.5" />}
                    <button type="button"
                        onClick={() => { setOpen(false); help.openDrawer('glossary', id); }}
                        className="mt-1.5 block text-accenth hover:underline text-[12px]">자세히 보기 →</button>
                </div>
            </Popover>
        </span>
    );
}
