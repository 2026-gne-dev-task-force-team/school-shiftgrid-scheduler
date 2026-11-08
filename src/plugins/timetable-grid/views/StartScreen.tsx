/**
 * 시간표 시작 화면 — 보고 있는 시간표가 없을 때(리본으로 처음 열었을 때 · 보던 표가 휴지통으로 갔을 때) 뜬다.
 *   쥔님(2026-11-08 21:14): 「리본에서 열 때 선택된 게 없으면 새 시간표 만들기나 있는 시간표 목록 보여주는 첫 화면」.
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 만들기는 createSheet, 열기는 NodesApi.open(= 탐색기 두 번 누르기와 같은 길).
 *   ⛔ 아무것도 묻지 않는다 — 「새 시간표」 한 번이면 빈 표가 바로 열린다(명세 「처음 켰을 때」).
 */
import { useSyncExternalStore } from 'react';
import { Icon } from '../../../pane-ui-system';
import {
    subscribeNodes, getSheetNodes, getSpecialNodes, inTrash, createSheet, parentNameOf, parentSheetOf, getNodesApi,
} from '../nodes';

export function StartScreen() {
    const sheetNodes = useSyncExternalStore(subscribeNodes, getSheetNodes, getSheetNodes);
    const specialNodes = useSyncExternalStore(subscribeNodes, getSpecialNodes, getSpecialNodes);
    const sheets = sheetNodes.filter((n) => !inTrash(n.id));
    const specialCount = (sheetId: string) =>
        specialNodes.filter((s) => !inTrash(s.id) && parentSheetOf(s.id) === sheetId).length;

    const open = (id: string) => { getNodesApi()?.open(id); };
    const make = () => { const id = createSheet(); if (id) open(id); };

    return (
        <div className="h-full overflow-auto select-none">
            <div className="max-w-[560px] mx-auto px-6 py-10 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-text">
                        <Icon name="schedule" size={18} className="text-muted" />
                        <span className="text-[16px] font-medium">시간표</span>
                    </div>
                    <div className="text-[12px] text-muted">새로 만들거나, 만들어 둔 시간표를 고른다.</div>
                </div>

                <button
                    type="button"
                    onClick={make}
                    disabled={!getNodesApi()}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line text-left hover:bg-text/[0.04] disabled:opacity-40"
                >
                    <span className="flex items-center justify-center w-8 h-8 rounded-md bg-accent/10 text-accent">
                        <Icon name="plus" size={16} />
                    </span>
                    <span className="flex flex-col">
                        <span className="text-[13px] font-medium text-text">새 시간표</span>
                        <span className="text-[11px] text-muted">빈 표(월~금 × 6행)가 바로 열린다</span>
                    </span>
                </button>

                <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-muted px-1">만들어 둔 시간표 · {sheets.length}</div>
                    {sheets.length === 0 ? (
                        <div className="px-1 py-3 text-[12px] text-muted">아직 없다.</div>
                    ) : (
                        <ul className="flex flex-col rounded-lg border border-line overflow-hidden">
                            {sheets.map((n) => {
                                const folder = parentNameOf(n.id);
                                const sp = specialCount(n.id);
                                return (
                                    <li key={n.id} className="border-b border-line last:border-b-0">
                                        <button
                                            type="button"
                                            onClick={() => open(n.id)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-text/[0.04]"
                                        >
                                            <Icon name="schedule" size={14} className="text-muted shrink-0" />
                                            <span className="text-[13px] text-text truncate">{n.name}</span>
                                            {sp > 0 && (
                                                <span className="flex items-center gap-0.5 text-[11px] text-accent shrink-0">
                                                    <Icon name="sparkles" size={11} /> {sp}
                                                </span>
                                            )}
                                            <span className="flex-1" />
                                            {folder && (
                                                <span className="flex items-center gap-1 text-[11px] text-muted truncate max-w-[40%]">
                                                    <Icon name="folder" size={11} /> {folder}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
