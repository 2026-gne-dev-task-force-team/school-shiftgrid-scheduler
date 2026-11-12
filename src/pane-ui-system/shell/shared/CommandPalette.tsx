/**
 * 명령 팔레트 — Ctrl/⌘+P 로 뜬다. 이름으로 걸러 찾고, Enter 로 실행, Esc 로 닫는다(키보드만으로 완결).
 *   쥔님 2026-11-01: *"고수들의 편의성을 위해 만들까?"* → 만든다. 「모든 동작은 명령」이라 여기서 다 보인다.
 *   🔴 색·치수는 토큰 클래스로만(구조 검사 ①).
 *   ⭐ R2(S7): 사람 이름만 — 영문 내부 id 는 안 보이고 안 걸린다(오른쪽엔 보낸 꾸러미 이름) · palette:false(「삭제 확인」 같은
 *      다른 화면 안의 내부 단계)·지금 안 되는(enabled=false) 명령은 뺀다 · 막 z-modal + 어두운 배경 · 열림 ui-pop-in · 한글 조합 Enter 무시.
 */
import { usePresence } from '../../primitives/presence';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../primitives/Icon';
import { isImeEnter } from '../../primitives/ime';
import { pushEscapeLayer, useLayerToken } from '../../primitives/layers';
import { listCommands, listPlugins, runCommand, commandEnabled, useContribVersion, type CommandDef } from '../../plugin';
import { useKeyOverrides, effectiveKey, formatKey } from '../../keybindings';

type Cmd = CommandDef & { owner: string };

/** 팔레트에 보일 명령 — palette:false·지금 안 되는 것을 빼고, 사람 이름(제목·꾸러미 이름)으로만 거른다. */
export function paletteCommands(list: Cmd[], q: string, ownerName: (owner: string) => string): Cmd[] {
    const s = q.trim().toLowerCase();
    return list.filter((c) => c.palette !== false && commandEnabled(c.id)
        && (!s || c.title.toLowerCase().includes(s) || (c.keywords ?? []).some((k) => k.toLowerCase().includes(s)) || ownerName(c.owner).toLowerCase().includes(s)));
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [q, setQ] = useState('');
    const ko = useKeyOverrides();   // 줄마다 지금 키를 보인다(설정에서 바꾸면 바로)
    const [sel, setSel] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const layer = useLayerToken();
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useContribVersion();   // 명령이 늘고 줄면(플러그인 켜고 끄기) 목록을 다시 그린다

    const names = new Map(listPlugins().map((p) => [p.id, p.name]));
    const ownerName = (o: string) => names.get(o) ?? '';
    const { mounted, closing } = usePresence(open);
    const filtered = mounted ? paletteCommands(listCommands(), q, ownerName) : [];

    // 열릴 때 초기화 + 입력에 포커스(키보드만으로 완결) · Esc 는 창틀 Esc 층으로(맨 위 하나만 닫힌다)
    useEffect(() => {
        if (!open) return;
        setQ(''); setSel(0);
        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        const popEsc = pushEscapeLayer(() => closeRef.current(), layer);
        return () => { window.clearTimeout(t); popEsc(); };
    }, [open, layer]);
    useEffect(() => { setSel(0); }, [q]);
    // 고른 항목을 보이게 끌어온다
    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${sel}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [sel]);

    if (!mounted) return null;

    const run = (id: string) => { onClose(); runCommand(id); };
    const onKey = (e: React.KeyboardEvent) => {
        if (isImeEnter(e)) return;   // 한글 조합 중 Enter 는 글자 확정이다
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[sel]; if (c) run(c.id); }
    };

    return createPortal(
        <div className={`fixed inset-0 z-modal flex items-start justify-center pt-[12vh] ${closing ? 'pointer-events-none' : ''}`} role="dialog" aria-modal="true" aria-label="명령 팔레트">
            <div className={`absolute inset-0 bg-text/30 ${closing ? 'ui-fade-out' : 'ui-fade-in'}`} onClick={onClose} aria-hidden="true" />
            <div className={`relative w-[min(560px,92vw)] max-h-[70vh] flex flex-col rounded-lg border border-line bg-panel shadow-xl overflow-hidden ${closing ? 'ui-pop-out' : 'ui-pop-in'}`}>
                {/* oxlint-disable-next-line react/forbid-elements -- 팔레트 검색칸 — 틀 크기 입력 */}
                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="명령 검색…"
                    aria-label="명령 검색"
                    className="shrink-0 h-topbar px-pad text-body bg-panel2 text-text border-b border-line outline-none"
                />
                <div ref={listRef} className="flex-1 min-h-0 overflow-auto py-1">
                    {filtered.length === 0
                        ? <div className="px-pad py-3 text-small text-muted select-none">맞는 명령이 없습니다</div>
                        : filtered.map((c, i) => {
                            const key = effectiveKey(c.id, c.keys, ko);
                            const who = ownerName(c.owner);
                            return (
                                // oxlint-disable-next-line react/forbid-elements -- 팔레트 목록 줄 — 행 모양
                                <button
                                    key={c.id}
                                    type="button"
                                    data-cmd-idx={i}
                                    onMouseMove={() => setSel(i)}
                                    onClick={() => run(c.id)}
                                    className={`w-full flex items-center gap-2 h-row px-pad text-small text-left ${i === sel ? 'bg-accent/15 text-text' : 'text-text hover:bg-text/[0.06]'}`}
                                >
                                    <span className="w-4 shrink-0 grid place-items-center">{c.icon && <Icon name={c.icon} size={14} />}</span>
                                    <span className="flex-1 min-w-0 truncate">{c.title}</span>
                                    {key && <kbd className="shrink-0 text-note text-muted">{formatKey(key)}</kbd>}
                                    {who && <span className="shrink-0 text-note text-muted truncate max-w-[40%]">{who}</span>}
                                </button>
                            );
                        })}
                </div>
            </div>
        </div>,
        document.body,
    );
}
