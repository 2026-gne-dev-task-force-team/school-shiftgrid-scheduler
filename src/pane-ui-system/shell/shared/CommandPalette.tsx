/**
 * 명령 팔레트 — Ctrl/⌘+P 로 뜬다. 이름으로 걸러 찾고, Enter 로 실행, Esc 로 닫는다(키보드만으로 완결).
 *   쥔님 2026-11-01: *"고수들의 편의성을 위해 만들까?"* → 만든다. 「모든 동작은 명령」이라 여기서 다 보인다.
 *   🔴 색·치수는 토큰 클래스로만(구조 검사 ①).
 */
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../primitives/Icon';
import { listCommands, runCommand, useContribVersion } from '../../plugin';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    useContribVersion();   // 명령이 늘고 줄면(플러그인 켜고 끄기) 목록을 다시 그린다

    const s = q.trim().toLowerCase();
    const filtered = s
        ? listCommands().filter((c) => c.title.toLowerCase().includes(s) || c.id.toLowerCase().includes(s))
        : listCommands();

    // 열릴 때 초기화 + 입력에 포커스(키보드만으로 완결)
    useEffect(() => {
        if (!open) return;
        setQ(''); setSel(0);
        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);
    useEffect(() => { setSel(0); }, [q]);
    // 고른 항목을 보이게 끌어온다
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${sel}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [sel]);

    if (!open) return null;

    const run = (id: string) => { runCommand(id); onClose(); };
    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[sel]; if (c) run(c.id); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[12vh]">
            <div className="absolute inset-0 bg-text/20 peek-scrim" onClick={onClose} aria-hidden="true" />
            <div className="relative w-[min(560px,92vw)] max-h-[70vh] flex flex-col rounded-lg border border-line bg-panel shadow-xl overflow-hidden">
                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="명령 검색…"
                    aria-label="명령 검색"
                    className="shrink-0 h-topbar px-pad text-[14px] bg-panel2 text-text border-b border-line outline-none"
                />
                <div ref={listRef} className="flex-1 min-h-0 overflow-auto py-1">
                    {filtered.length === 0
                        ? <div className="px-pad py-3 text-[13px] text-muted select-none">맞는 명령이 없습니다</div>
                        : filtered.map((c, i) => (
                            <button
                                key={c.id}
                                type="button"
                                data-cmd-idx={i}
                                onMouseMove={() => setSel(i)}
                                onClick={() => run(c.id)}
                                className={`w-full flex items-center gap-2 h-row px-pad text-[13px] text-left ${i === sel ? 'bg-accent/15 text-text' : 'text-text hover:bg-text/[0.06]'}`}
                            >
                                <span className="w-4 shrink-0 grid place-items-center">{c.icon && <Icon name={c.icon} size={14} />}</span>
                                <span className="flex-1 min-w-0 truncate">{c.title}</span>
                                <span className="shrink-0 text-[11px] text-muted truncate max-w-[45%]">{c.id}</span>
                            </button>
                        ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
