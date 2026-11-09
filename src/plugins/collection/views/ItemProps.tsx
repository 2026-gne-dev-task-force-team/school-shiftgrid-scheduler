/**
 * 항목 노드의 속성 칸 + 줄 미리보기 — 기본 칸 + 목록의 사용자 칸을 PropertyList 한 줄로. 표와 같은 Cell 이라 고르기·날짜도 여기서 고친다.
 *   🔴 칸 자리는 속성 패널이 주고, 칸은 항목 주인(목록 꾸러미)이 낸다(contributes.properties). 고치기는 kit 의 다리 그대로 — 새 저장 길 없음.
 *   「목록」·(tree 면) 「부모」 칸은 보기 전용(트리 갈아타기는 표에서).
 *   줄 미리보기(ItemPeek): 칸 + 줄 문서(page-doc 이 있으면) — 문서 편집기는 페이지 편집기 꾸러미가 page-doc 약속으로 내준다(없으면 칸만).
 */
import { useSyncExternalStore } from 'react';
import type { PluginHost, PropertiesPaneProps } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — page-doc 약속 타입은 페이지 편집기 꾸러미 contracts 에서(값은 host.modules.use).
import type { PageDocApi } from '../../page/contracts/page-doc';
import type { RecordCellValue, RecordField } from '../contracts/collection';
import type { Bridge } from '../define';
import { PropertyList } from './PropertyList';

export function ItemProps({ kit, target }: { kit: Bridge } & PropertiesPaneProps) {
    useSyncExternalStore(kit.subscribe, kit.rev, kit.rev);   // 표에서 고쳐도 칸이 따라온다
    const { config: cfg } = kit;
    const it = kit.itemOf(target.id);
    if (!it) return null;
    const titleKey = cfg.baseFields[0].key;
    const userFields = kit.userFieldsOf(it.listId);
    const extra: RecordField[] = [{ key: '_list', label: cfg.listLabel, type: 'text', readOnly: true, locked: true }];
    const values: Record<string, RecordCellValue> = { ...it.values, [titleKey]: it.name, _list: kit.parentNameOf(it.id) ?? '' };
    if (cfg.tree) {
        extra.push({ key: '_parent', label: cfg.tree.parentLabel, type: 'text', readOnly: true, locked: true });
        values._parent = (it.parentId && kit.itemOf(it.parentId)?.name) || '';
    }
    return (
        <PropertyList
            fields={[...cfg.baseFields, ...userFields, ...extra]}
            values={values}
            onChange={(key, v) => {
                if (key === titleKey && String(v ?? '').trim() === '') return;   // 이름은 비울 수 없다
                kit.setValue(it.id, key, v);
            }}
            onOptionsChange={(key, options) => kit.setUserFields(it.listId, userFields.map((f) => (f.key === key ? { ...f, options } : f)))}
        />
    );
}

export function ItemPeek({ kit, host, id }: { kit: Bridge; host: PluginHost; id: string }) {
    useSyncExternalStore(kit.subscribe, kit.rev, kit.rev);
    const api = kit.nodes();
    const node = api?.get(id);
    if (!api || !node) return <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
    const pd = host.modules.use<PageDocApi>('page-doc');
    return (
        <div className="flex flex-col gap-3">
            <ItemProps kit={kit} host={host} target={{ type: node.type, id }} />
            {pd && (
                <div className="border-t border-line -mx-4">
                    <pd.PageDoc host={host} docKey={id} value={node.body} onChange={(v) => api.setBody(id, v)}
                        icon={node.icon} onSetIcon={(i) => api.setIcon(id, i)}
                        title={node.name} onRename={(n) => api.rename(id, n)} />
                </div>
            )}
        </div>
    );
}
