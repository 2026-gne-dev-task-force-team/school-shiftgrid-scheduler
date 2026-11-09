/**
 * 시간표 그리드 화면 — 시간표 한 장을 그리고 손으로 고친다(명세 1·2단계).
 *   🔴 데이터는 노드 다리(nodes.ts)에서만 — 시간표도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 *   그리는 일은 TimeGrid(달력 주 보기 꼴)가 한다 · 범위·열 꼴·보이는 시각 같은 시간표 설정은 오른쪽 속성 패널(TimetableProps) — ⛔ 위쪽 도구 막대 없음(T3).
 *   손 편집은 전부 model.ts 순수 함수로 돌린 뒤 저장(applyEdit) — ⌘Z 는 시간표마다 더미에 쌓인다.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { Icon, undoKey } from '../../../pane-ui-system';
import { useActiveSheet } from '../store';
import { subscribeNodes, getSheetNodes, isSheet, sheetDataOf, applyEdit, getNodesApi, inTrash, stepEdit } from '../nodes';
import { StartScreen } from './StartScreen';
import { TimeGrid } from './TimeGrid';

export function GridTab({ leafId }: { leafId?: string }) {
    const Frame = getNodesApi()?.Frame;
    const activeId = useActiveSheet();
    // 노드가 바뀔 때만 다시 그린다(편집도 같은 recompute 로 전파된다).
    const sheetNodes = useSyncExternalStore(subscribeNodes, getSheetNodes, getSheetNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const data = useMemo(() => (activeId && isSheet(activeId) ? sheetDataOf(activeId) : null), [activeId, sheetNodes]);

    // 보고 있는 시간표가 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || !data || inTrash(activeId)) return <StartScreen leafId={leafId} />;
    if (!Frame) return <p className="p-4 text-small text-muted">노드 시스템이 꺼져 있어 화면을 그릴 수 없습니다.</p>;

    return (
        <div className="h-full flex flex-col overflow-hidden select-none"
            onKeyDown={(e) => { const u = undoKey(e.nativeEvent); if (u && !e.defaultPrevented) { e.preventDefault(); stepEdit(activeId, u); } }}>
            <Frame nodeId={activeId} leafId={leafId}
                fallback={<Icon name="schedule" size={22} className="text-muted" />}>
                <TimeGrid data={data} edit={(fn) => applyEdit(activeId, fn)} />
            </Frame>
        </div>
    );
}
