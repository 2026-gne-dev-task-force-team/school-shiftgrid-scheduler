/**
 * 끼워 넣기 블록(P5) — 다른 노드를 이 자리에 보여 준다. 모습은 그 타입이 정한다(nodes.Embed — 카드·미리보기·링크 줄).
 *   🔴 데이터는 노드 다리로만 · 끼운 쪽 자료는 안 만진다. 아직 안 골랐으면 이름으로 거르는 고르기 목록.
 */
import { useState } from 'react';
import { pressProps } from '../../../pane-ui-system';
import { getNodesApi, inlineBlocked, inTrash } from '../nodes';
import type { NodeDisplay } from '../core/types';

/**
 * R3-E 표시 모양 — card(기본 · 옛 블록) 는 타입의 embed 그대로, inline 은 nodes.Embed 에 view 'inline' 을 실어
 *   그 타입이 본문 보기를 그린다(컬렉션 = 표 편집 · 페이지 = 본문 미리보기 · 시트 = 격자 미리보기). 높이는 max-h-96(384px) 까지, 넘치면 스크롤.
 *   🔴 자기 자신·조상을 inline 으로 두면(옛 자료·옮긴 뒤) 카드로 물러서고 한 줄 안내 — 무한 끼움 막기.
 */
export function NodeBlock({ nodeId, selfId, onPick, display }: { nodeId?: string; selfId: string; onPick: (nodeId: string) => void; display?: NodeDisplay }) {
    const api = getNodesApi();
    const [q, setQ] = useState('');
    const [active, setActive] = useState(0);   // 키보드로 고를 후보(↓↑ 이동 · Enter 고르기)
    if (!api) return <div className="my-1 text-small text-muted">항목 시스템이 꺼져 있습니다.</div>;
    if (nodeId) {
        const Embed = api.Embed;
        if (display !== 'inline') return <Embed nodeId={nodeId} />;
        if (inlineBlocked(nodeId, selfId)) {
            return (
                <div data-node-inline-blocked>
                    <Embed nodeId={nodeId} />
                    <div className="text-small text-muted px-1">자기 자신이나 상위 항목은 본문에 펼칠 수 없어 카드로 보여 줍니다.</div>
                </div>
            );
        }
        return (
            <div data-node-inline={nodeId} className="my-1 max-h-96 overflow-auto rounded border border-line">
                <Embed nodeId={nodeId} view="inline" />
            </div>
        );
    }
    // 자기 자신은 뺀다 — 페이지가 자기를 끼우면 카드가 제자리를 도는 꼴이다.
    const items = api.find((n) => n.id !== selfId && !inTrash(n.id) && n.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
    const cur = Math.min(active, Math.max(0, items.length - 1));
    const onKey = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;   // 한글 조합 중 Enter 는 글자 확정이다
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            if (items.length) setActive((cur + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
        } else if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            if (items[cur]) onPick(items[cur].id);
        }
    };
    return (
        <div className="my-1 rounded border border-line p-2">
            <input
                autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="끼워 넣을 항목 이름…"
                aria-label="끼워 넣을 항목 찾기" role="combobox" aria-expanded aria-controls="node-pick-list"
                aria-activedescendant={items[cur] ? `node-pick-${items[cur].id}` : undefined}
                onKeyDown={onKey}
                className="w-full bg-transparent outline-none text-body text-text border-b border-line pb-1 mb-1"
            />
            {items.length === 0
                ? <div className="text-small text-muted py-1">맞는 항목이 없습니다.</div>
                : (
                    <div id="node-pick-list" role="listbox">
                        {items.map((n, i) => (
                            <div key={n.id} id={`node-pick-${n.id}`} {...pressProps(() => onPick(n.id))} role="option" aria-selected={i === cur}
                                className={`w-full flex items-center gap-2 px-1 py-1 text-left text-body hover:text-text hover:bg-text/[0.05] rounded ${i === cur ? 'text-text bg-text/[0.06]' : 'text-muted'}`}>
                                <span>{n.icon ?? '·'}</span><span className="truncate">{n.name}</span>
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}
