/**
 * rich-cell 약속의 그리기 둘 — RichText(작은 마크다운 + 노드 칩) · NodePicker(`@` 노드 고르기).
 *   🔴 색은 토큰 클래스만(text-accent·text-ok …). 칩은 노드 쪽 부품(nodes.Chip)에 맡긴다 — 타입별 모습은 노드 타입 등록 표의 chip.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { MenuItem, MenuList, Popover, TextInput, handleMenuKey } from '../../../pane-ui-system';
import type { NodePickerProps, RichTextProps } from '../contracts/rich-cell';
import type { PublicNode } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { isPlain, parseRich, type RichColor, type RichNode } from '../core/rich';
import { getNodesApi } from '../nodes';

const COLOR_CLASS: Record<RichColor, string> = {
    accent: 'text-accent', ok: 'text-ok', bad: 'text-bad', warn: 'text-warn', muted: 'text-muted',
};

function draw(ns: RichNode[], readOnly: boolean): ReactNode[] {
    return ns.map((n, k) => {
        switch (n.t) {
            case 'text': return <Fragment key={k}>{n.s}</Fragment>;
            case 'br': return <br key={k} />;
            case 'node': {
                const Chip = getNodesApi()?.Chip;
                return Chip ? <Chip key={k} nodeId={n.id} readOnly={readOnly} /> : <span key={k} className="text-muted">@{n.id}</span>;
            }
            case 'b': return <strong key={k} className="font-semibold">{draw(n.c, readOnly)}</strong>;
            case 'i': return <em key={k}>{draw(n.c, readOnly)}</em>;
            case 's': return <s key={k}>{draw(n.c, readOnly)}</s>;
            case 'color': return <span key={k} data-rich-color={n.color} className={COLOR_CLASS[n.color]}>{draw(n.c, readOnly)}</span>;
            case 'link': return (
                <a key={k} href={n.href} target="_blank" rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-accent underline underline-offset-2">{draw(n.c, readOnly)}</a>
            );
        }
    });
}

export function RichText({ text, className = '', readOnly = false }: RichTextProps) {
    if (isPlain(text)) return <span className={className}>{text}</span>;
    return <span data-rich className={className}>{draw(parseRich(text), readOnly)}</span>;
}

/** 고를 수 있는 노드 — 살아 있는 노드 전부(휴지통·뿌리 빼고). 이름 없는 것도 뺀다. */
function candidates(): PublicNode[] {
    const api = getNodesApi();
    if (!api) return [];
    const { main, trash } = api.roots;
    return api.find((n) => n.id !== main && n.id !== trash && !!n.name && !api.isTrashed(n.id));
}

const MAX_SHOWN = 50;

export function NodePicker({ anchor, onPick, onClose }: NodePickerProps) {
    // 노드가 바뀌면(이름·휴지통) 다시 그린다 — 다리 구독
    const [, setRev] = useState(0);
    useEffect(() => { const d = getNodesApi()?.subscribe(() => setRev((v) => v + 1)); return () => d?.dispose(); }, []);
    const [q, setQ] = useState('');
    const listRef = useRef<HTMLDivElement>(null);
    const api = getNodesApi();
    const key = q.trim().toLowerCase();
    const all = candidates();
    const shown = (key ? all.filter((n) => n.name.toLowerCase().includes(key)) : all).slice(0, MAX_SHOWN);
    const pathOf = (id: string): string => {
        const p = api?.path(id) ?? [];
        return p.slice(0, -1).map((pid) => api?.get(pid)?.name ?? '').filter(Boolean).join(' › ');
    };
    return (
        <Popover anchor={anchor} width={280} onClose={onClose}>
            <div className="flex flex-col gap-1" data-node-picker>
                <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="항목 찾기" aria-label="항목 찾기"
                    data-node-picker-search
                    onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') handleMenuKey(e, listRef.current); }}
                    onEnter={() => { if (shown[0]) onPick(shown[0].id); }} />
                <div ref={listRef} className="max-h-72 overflow-auto">
                    <MenuList label="항목 고르기">
                        {shown.map((n) => {
                            const path = pathOf(n.id);
                            return (
                                <div key={n.id} className="contents" data-node-picker-option={n.id}>
                                    <MenuItem label={n.name} onSelect={() => onPick(n.id)} />
                                    {path && <div className="-mt-1 pb-1 pl-8 pr-pad text-note text-muted truncate">{path}</div>}
                                </div>
                            );
                        })}
                    </MenuList>
                    {shown.length === 0 && <div className="px-2 py-1 text-note text-muted">맞는 항목이 없어요</div>}
                </div>
            </div>
        </Popover>
    );
}
