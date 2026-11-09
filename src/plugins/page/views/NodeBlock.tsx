/**
 * 끼워 넣기 블록(P5) — 다른 노드를 이 자리에 보여 준다. 모습은 그 타입이 정한다(nodes.Embed — 카드·미리보기·링크 줄).
 *   🔴 데이터는 노드 다리로만 · 끼운 쪽 자료는 안 만진다. 아직 안 골랐으면 이름으로 거르는 고르기 목록.
 */
import { useState } from 'react';
import { pressProps } from '../../../pane-ui-system';
import { getNodesApi, inTrash } from '../nodes';

export function NodeBlock({ nodeId, selfId, onPick }: { nodeId?: string; selfId: string; onPick: (nodeId: string) => void }) {
    const api = getNodesApi();
    const [q, setQ] = useState('');
    if (!api) return <div className="my-1 text-small text-muted">항목 시스템이 꺼져 있습니다.</div>;
    if (nodeId) { const Embed = api.Embed; return <Embed nodeId={nodeId} />; }
    // 자기 자신은 뺀다 — 페이지가 자기를 끼우면 카드가 제자리를 도는 꼴이다.
    const items = api.find((n) => n.id !== selfId && !inTrash(n.id) && n.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
    return (
        <div className="my-1 rounded border border-line p-2">
            <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="끼워 넣을 항목 이름…"
                aria-label="끼워 넣을 항목 찾기"
                className="w-full bg-transparent outline-none text-body text-text border-b border-line pb-1 mb-1"
            />
            {items.length === 0
                ? <div className="text-small text-muted py-1">맞는 항목이 없습니다.</div>
                : items.map((n) => (
                    <div key={n.id} {...pressProps(() => onPick(n.id))}
                        className="w-full flex items-center gap-2 px-1 py-1 text-left text-body text-muted hover:text-text hover:bg-text/[0.05] rounded">
                        <span>{n.icon ?? '·'}</span><span className="truncate">{n.name}</span>
                    </div>
                ))}
        </div>
    );
}
