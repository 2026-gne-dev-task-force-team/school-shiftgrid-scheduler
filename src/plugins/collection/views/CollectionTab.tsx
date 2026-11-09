/**
 * 컬렉션 화면 — 한 줄 = 한 항목, 칸 = 기본 칸 + 목록의 사용자 칸. 표는 레코드 뷰(RecordView)가 그린다(제어형).
 *   🔴 데이터는 kit(노드 다리)에서만 — 목록·항목은 노드고 저장·휴지통·되돌리기는 노드 시스템이 쥔다.
 *   보고 있는 목록이 없으면(리본으로 처음 열기 · 보던 목록이 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
 *   ⛔ 뽑기·조 나누기·예약 같은 쓰임새는 없다 — 위층이 증축한다.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { EmptyState, StartScreen as StartScreenBase, useFrameToolbar, type PeekHandle } from '../../../pane-ui-system';
import { useLauncherTab } from '../../../pane-ui-system/plugin';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { PasteRequest, RecordCellValue, RecordField, RecordTree } from '../contracts/collection';
import type { Bridge } from '../define';
import { RecordView } from '../RecordView';
import { effectiveParentId } from '../tree';
import { ItemPeek } from './ItemProps';

type Rec = { id: string } & Record<string, RecordCellValue>;

/** 레코드 뷰 붙여넣기(보이는 칸 key 순서 + 글자) → 기본 칸 순서의 TSV 한 덩어리. 순수 함수. */
export function pasteToTsv(req: PasteRequest, keys: readonly string[]): string {
    return req.rows.map((r) => keys.map((k) => { const i = req.keys.indexOf(k); return i < 0 ? '' : (r[i] ?? ''); }).join('\t')).join('\n');
}

function CollectionStart({ kit, leafId }: { kit: Bridge; leafId?: string }) {
    const { config: cfg } = kit;
    useLauncherTab(leafId, `새 ${cfg.listLabel}`);
    const items = kit.lists().map((l) => ({ id: l.id, name: l.name, folder: kit.parentNameOf(l.id) }));
    const open = (id: string) => { kit.nodes()?.open(id); };
    return (
        <StartScreenBase
            icon={cfg.listIcon}
            title={cfg.listLabel}
            noun={cfg.listLabel}
            description={cfg.text.startDescription}
            newLabel={`새 ${cfg.listLabel}`}
            newHint={cfg.text.startHint}
            items={items}
            onNew={() => { const id = kit.createList(); if (id) open(id); }}
            onOpen={open}
            disabled={!kit.nodes()}
        />
    );
}

export function CollectionTab({ kit, host, peek, leafId }: { kit: Bridge; host?: PluginHost; peek?: PeekHandle; leafId?: string }) {
    const { config: cfg } = kit;
    const rev = useSyncExternalStore(kit.subscribe, kit.rev, kit.rev);
    const activeId = kit.active();
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const bar = useFrameToolbar();   // Frame 툴바 자리(Q12)
    const titleKey = cfg.baseFields[0].key;
    const baseKeys = useMemo(() => cfg.baseFields.map((f) => f.key), [cfg]);

    const records = useMemo<Rec[]>(() => {
        if (!activeId) return [];
        const items = kit.itemsIn(activeId);
        return items.map((it) => ({ ...it.values, [titleKey]: it.name, id: it.id, __parent: cfg.tree ? effectiveParentId(items, it.id) : null }) as Rec);
        // rev 가 바뀔 때만 다시 읽는다(노드 스냅샷이 바뀐 때) — kit.itemsIn 은 매 호출 새로 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rev, activeId]);

    if (!activeId || !kit.lists().some((l) => l.id === activeId)) return <CollectionStart kit={kit} leafId={leafId} />;

    const Frame = kit.nodes()?.Frame;
    if (!Frame) return <EmptyState icon="warn" title="화면을 그릴 수 없습니다" description="노드 시스템이 꺼져 있습니다." />;
    const fields: RecordField[] = [...cfg.baseFields, ...kit.userFieldsOf(activeId)];
    const tree: RecordTree<Rec> | undefined = cfg.tree ? {
        parentOf: (r) => (r.__parent as string | null) ?? null,
        collapsed: (id) => collapsed.has(id),
        onToggleCollapse: (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
        onIndent: kit.indent,
        onOutdent: kit.outdent,
        onMoveUnder: kit.setParent,
        onAddChild: (pid) => { const nid = kit.addItem(activeId); if (nid) kit.setParent(nid, pid); },
    } : undefined;

    return (
        <div className="h-full select-none">
            <Frame nodeId={activeId} leafId={leafId} toolbar={bar.slot} headerExtra={`${records.length}${cfg.unit}`}>
            <div className="h-full flex flex-col">
                <RecordView<Rec>
                    toolbarHost={bar.host}
                    fields={fields}
                    records={records}
                    getId={(r) => r.id}
                    viewKey={cfg.viewKey}
                    titleKey={titleKey}
                    onCellChange={(id, key, value) => kit.setValue(id, key, value)}
                    onFieldsChange={(next) => kit.setUserFields(activeId, next.filter((f) => !baseKeys.includes(f.key)))}
                    onAddRecord={() => { kit.addItem(activeId); }}
                    onDeleteRecords={(ids) => ids.forEach(kit.removeItem)}
                    onPaste={(req) => kit.pasteItems(activeId, pasteToTsv(req, baseKeys))}
                    onReorder={kit.reorderItem}
                    tree={tree}
                    iconOf={(id) => kit.nodes()?.get(id)?.icon}
                    onOpenRecord={host && peek ? (id) => peek.show(<ItemPeek kit={kit} host={host} id={id} />, { wideMin: 480 }) : undefined}
                    className="flex-1 min-h-0"
                />
            </div>
            </Frame>
        </div>
    );
}
