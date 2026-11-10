/**
 * 달력 저장소 끼워 넣기 모습(W9) — 페이지 본문에 이 저장소가 어떻게 보일지(nodes.Embed 의 타입 창구).
 *   · 기본(view 없음) = 링크 한 줄(아이콘+이름 · 누르면 연다) — 타입이 embed 를 안 등록했을 때와 같은 모습.
 *   · view 'inline' = 이름 머리 + 일정 표 한 벌(제목·언제 · 시작 순) + 「보기: 달력 — 열어서 보기」 한 줄.
 *     🔴 달력 격자는 인라인에서 못 그린다(월 보기는 칸을 꽉 채우는 스크롤 화면) → 표로 떨어진다. 그 사실을 한 줄로 알린다.
 *     ⛔ 일정 자료는 읽기만 한다(고치는 길은 열어서). 휴지통 일정은 뺀다.
 */
import { useSyncExternalStore } from 'react';
import { Icon, pressProps } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { EmbedProps } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { getEventNodes, getNodesApi, inTrash, subscribeNodes } from '../nodes';
import { storedToEvent } from '../event-fields';

/** 표에 그릴 일정 하나 — 시작 순 정렬용 키와 「언제」 글 */
export interface StoreRow { id: string; name: string; when: string; start: string }

/** 저장소 밑 일정 → 표 줄(시작 순) — 순수 함수. parent 는 NodesApi.parent. */
export function storeRows(nodes: { id: string; name: string; data?: unknown }[], storeId: string, parent: (id: string) => string | null | undefined, trashed: (id: string) => boolean): StoreRow[] {
    const rows: StoreRow[] = [];
    for (const n of nodes) {
        if (parent(n.id) !== storeId || trashed(n.id)) continue;
        const d = storedToEvent(n.data);
        if (!d) continue;
        rows.push({ id: n.id, name: n.name, start: d.start, when: d.allDay ? d.start.slice(0, 10) : d.start.slice(0, 16).replace('T', ' ') });
    }
    return rows.sort((a, b) => a.start.localeCompare(b.start));
}

export function StoreEmbed({ nodeId, view }: EmbedProps & { host: PluginHost }) {
    const evNodes = useSyncExternalStore(subscribeNodes, getEventNodes, getEventNodes);
    const api = getNodesApi();
    const node = api?.get(nodeId);
    if (!api || !node) return null;
    const head = (cls: string) => (
        <div {...pressProps(() => api.open(nodeId))} className={cls}>
            {node.icon ? <span>{node.icon}</span> : <Icon name="calendar" size={14} className="text-muted" />}
            <span className="truncate">{node.name}</span>
        </div>
    );
    if (view !== 'inline') return head('my-1 flex items-center gap-2 w-full text-left px-2 py-1.5 rounded border border-line text-body text-text hover:bg-text/[0.04]');
    const rows = storeRows(evNodes, nodeId, (id) => api.parent(id), inTrash);
    return (
        <div data-cal-inline={nodeId} className="flex flex-col">
            {head('flex items-center gap-2 px-3 py-1.5 border-b border-line text-body font-semibold text-text cursor-pointer hover:underline')}
            {rows.length === 0
                ? <div className="px-3 py-2 text-small text-muted">일정이 없습니다.</div>
                : (
                    <table className="w-full text-body text-text">
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-b border-line">
                                    <td className="px-3 py-1 truncate">{r.name || <span className="text-muted">제목 없음</span>}</td>
                                    <td className="px-3 py-1 text-muted tabular-nums whitespace-nowrap">{r.when}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            <div {...pressProps(() => api.open(nodeId))} className="px-3 py-1.5 text-small text-muted cursor-pointer hover:underline">보기: 달력 — 열어서 보기</div>
        </div>
    );
}
