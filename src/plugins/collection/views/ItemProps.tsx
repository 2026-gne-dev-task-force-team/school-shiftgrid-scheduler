/**
 * 항목 노드의 속성 칸 + 줄 미리보기 — 기본 칸 + 목록의 사용자 칸을 PropertyList 한 줄로. 표와 같은 Cell 이라 고르기·날짜도 여기서 고친다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 항목 주인(목록 꾸러미)이 낸다(contributes.properties). 고치기는 kit 의 다리 그대로 — 새 저장 길 없음.
 *   「목록」·(tree 면) 「부모」 칸은 보기 전용(트리 갈아타기는 표에서).
 *   레코드 열기 페이지(ItemPeek) = RecordPage 한 벌(Q5 R5) — 칸만 여기서 만든다.
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost, PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { FieldOption, RecordCellValue, RecordField } from '../contracts/collection';
import type { Bridge } from '../define';
import { PropertyList } from './PropertyList';
import { RecordPage } from './RecordPage';

/** 항목 한 줄의 속성 — 속성 패널(ItemProps)과 열기 페이지(ItemPeek)가 같은 칸·값·고치기를 쓴다. 항목이 없으면 null. */
function useItemProperties(kit: Bridge, id: string): { fields: RecordField[]; values: Record<string, RecordCellValue>; onChange: (key: string, v: RecordCellValue) => void; onOptionsChange: (key: string, options: FieldOption[]) => void } | null {
    useSyncExternalStore(kit.subscribe, kit.rev, kit.rev);   // 표에서 고쳐도 칸이 따라온다
    const { config: cfg } = kit;
    const it = kit.itemOf(id);
    if (!it) return null;
    const titleKey = cfg.baseFields[0].key;
    const userFields = kit.userFieldsOf(it.listId);
    const extra: RecordField[] = [{ key: '_list', label: cfg.listLabel, type: 'text', readOnly: true, locked: true }];
    const values: Record<string, RecordCellValue> = { ...it.values, [titleKey]: it.name, _list: kit.parentNameOf(it.id) ?? '' };
    if (cfg.tree) {
        extra.push({ key: '_parent', label: cfg.tree.parentLabel, type: 'text', readOnly: true, locked: true });
        values._parent = (it.parentId && kit.itemOf(it.parentId)?.name) || '';
    }
    return {
        fields: [...cfg.baseFields, ...userFields, ...extra],
        values,
        onChange: (key, v) => {
            if (key === titleKey && String(v ?? '').trim() === '') return;   // 이름은 비울 수 없다
            kit.setValue(it.id, key, v);
        },
        onOptionsChange: (key, options) => kit.setUserFields(it.listId, userFields.map((f) => (f.key === key ? { ...f, options } : f))),
    };
}

export function ItemProps({ kit, target }: { kit: Bridge } & PropertiesPaneProps) {
    const p = useItemProperties(kit, target.id);
    return p ? <PropertyList {...p} /> : null;
}

/** 레코드 열기 페이지 — 컬렉션 공통 RecordPage 한 벌(틀 + 칸 + 문서). */
export function ItemPeek({ kit, host, id }: { kit: Bridge; host: PluginHost; id: string }) {
    const p = useItemProperties(kit, id);
    return p ? <RecordPage host={host} id={id} {...p} /> : <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
}
