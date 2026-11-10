/**
 * 끼워 넣기 모습(P5) — 페이지 카드: 아이콘 + 이름 + 첫 글 한 줄. 누르면 그 페이지를 연다.
 *   R3-E: view 'inline' 이면 본문 미리보기(읽기 전용) — 머리(아이콘·이름)를 누르면 연다.
 *   🔴 읽기 전용인 까닭: 페이지 편집기를 남의 본문 안에 또 띄우면 초점·되돌리기·캐럿 상태가 두 벌이 된다(노션도 페이지는 링크로만 끼운다).
 *   🔴 안쪽 끼움(node·childpage)은 이름 한 줄로만 — 다시 펼치지 않으니 페이지끼리 서로 끼워도 고리가 안 생긴다.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../../pane-ui-system';
import type { EmbedProps } from '../../explorer/contracts/nodes';
import { getNodesApi, getPageRev, pageDataOf, subscribePageNodes } from '../nodes';
import type { Block } from '../core/types';
import { InlineText } from './Inline';

export function PageCard({ nodeId, view }: EmbedProps) {
    useSyncExternalStore(subscribePageNodes, getPageRev, getPageRev);   // 끼운 페이지가 바뀌면 다시 그린다
    const api = getNodesApi();
    const node = api?.get(nodeId);
    if (!node) return null;
    const icon = node.icon ? <span className="text-lead">{node.icon}</span> : <Icon name="fileText" size={14} className="text-muted mt-0.5" />;
    if (view === 'inline') {
        return (
            <div data-page-inline={nodeId} className="px-3 py-2">
                <div {...pressProps(() => api?.open(nodeId))} className="flex items-start gap-2 mb-1 cursor-pointer hover:underline">
                    {icon}<span className="text-body font-semibold text-text truncate">{node.name || '제목 없음'}</span>
                </div>
                {pageDataOf(nodeId).blocks.map((b) => <PreviewLine key={b.id} block={b} />)}
            </div>
        );
    }
    const first = pageDataOf(nodeId).blocks.find((b) => b.text.trim())?.text.trim().slice(0, 80);
    return (
        <div {...pressProps(() => api?.open(nodeId))}
            className="my-1 flex items-start gap-2 w-full text-left px-3 py-2 rounded border border-line hover:bg-text/[0.04]">
            {icon}
            <span className="min-w-0">
                <span className="block text-body text-text truncate">{node.name}</span>
                {first && <span className="block text-small text-muted truncate">{first}</span>}
            </span>
        </div>
    );
}

const PREVIEW_CLASS: Record<string, string> = {
    heading1: 'text-lead font-bold', heading2: 'text-lead font-semibold', heading3: 'text-body font-semibold',
    quote: 'border-l-2 border-line pl-2 text-muted', code: 'font-mono text-small whitespace-pre-wrap bg-text/[0.04] rounded px-2 py-1',
};

/** 미리보기 한 줄 — 서식은 보이되 편집은 없다. */
function PreviewLine({ block: b }: { block: Block }) {
    if (b.type === 'divider') return <hr className="my-1 border-line" />;
    if (b.type === 'node' || b.type === 'childpage') {
        const n = b.nodeId ? getNodesApi()?.get(b.nodeId) : undefined;
        return n ? <div className="text-body text-muted truncate">↳ {n.icon ?? ''} {n.name}</div> : null;
    }
    if (b.type === 'table') return <div className="text-small text-muted">표 · 행 {b.table?.rows.length ?? 0}</div>;
    const mark = b.type === 'bulleted' ? '• ' : b.type === 'numbered' ? '· ' : b.type === 'todo' ? (b.checked ? '☑ ' : '☐ ') : '';
    return (
        <div className={`text-body text-text ${PREVIEW_CLASS[b.type] ?? ''}`} style={b.indent ? { paddingLeft: b.indent * 16 } : undefined}>
            {mark}<InlineText text={b.text} />
        </div>
    );
}
