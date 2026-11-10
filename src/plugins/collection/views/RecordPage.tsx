/**
 * 레코드 열기 페이지 한 벌(Q5 R5) — 노드 틀(nodes.Frame) + 속성 목록(PropertyList) + 본문(page-doc).
 *   컬렉션 항목·달력·계정·레코드 뷰 행의 열기 화면이 전부 이걸 쓴다 — 옛 세 벌(ItemPeek·EventCardPeek·account RecordPage)의 겉틀이 사라졌다.
 *   🔴 머리(아이콘·제목)·경로·⋯ 메뉴는 틀이 쥔다 — 여기선 칸과 본문만 놓는다. 틀은 피크 안이면 피크 머리줄에 윗줄을 그린다.
 *   🔴 page-doc 이 꺼져 있으면 문서 없이 틀 + 칸만 — 본문 편집기는 페이지 편집기 꾸러미 몫이다.
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입(값은 host.modules.use).
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import type { PageDocApi } from '../../page/contracts/page-doc';
import type { RecordPageProps } from '../contracts/collection';
import { useState } from 'react';
import type { RecordCellValue } from '../contracts/collection';
import { PropertyList } from './PropertyList';
import { findUniqueConflict } from '../unique';

/**
 * 「유일」 칸의 형제 값 — 같은 종류의 줄이 사는 그릇(하위 줄이면 위로 올라가 맨 위 줄의 부모) 아래 같은 종류 노드 전부.
 *   값은 data.values[key] — 없으면 제목 칸일 수 있어 노드 이름(key 가 'name' 일 때).
 */
function siblingValues(nodes: NodesApi, id: string, key: string): { id: string; value: RecordCellValue | undefined }[] {
    const type = nodes.get(id)?.type;
    let box = nodes.parent(id);
    while (box && nodes.get(box)?.type === type) box = nodes.parent(box);
    if (!box) return [];
    const out: { id: string; value: RecordCellValue | undefined }[] = [];
    const walk = (pid: string) => {
        for (const c of nodes.children(pid)) {
            if (c.type !== type) continue;
            const v = ((c.data as { values?: Record<string, RecordCellValue> } | undefined)?.values ?? {})[key];
            out.push({ id: c.id, value: v !== undefined ? v : key === 'name' ? c.name : undefined });
            walk(c.id);
        }
    };
    walk(box);
    return out;
}

export function RecordPage({ host, id, fields, values, onChange, onOptionsChange, after, onRename, onBody }: RecordPageProps & { host: PluginHost }) {
    const nodes = host.modules.use<NodesApi>('nodes');
    const node = nodes?.get(id);
    const [uniqueMsg, setUniqueMsg] = useState<string | null>(null);
    if (!nodes || !node) return <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
    // 🔴 「유일」 칸 — 형제 줄과 겹치는 값은 안 쓰고 이유를 칸 위에 보인다(표의 검사와 같은 규칙)
    const guarded = onChange && ((key: string, v: RecordCellValue) => {
        const f = fields.find((x) => x.key === key);
        if (f?.unique && findUniqueConflict(v, siblingValues(nodes, id, key), id)) {
            const msg = `「${f.label}」 칸은 유일해야 합니다 — 「${String(v ?? '')}」 값은 이미 다른 줄에 있습니다.`;
            setUniqueMsg(msg);
            host.notify({ level: 'warn', title: msg, key: 'collection.unique' });
            return;
        }
        setUniqueMsg(null);
        onChange(key, v);
    });
    const pd = host.modules.use<PageDocApi>('page-doc');
    const props = (
        <div className="flex flex-col gap-3">
            {uniqueMsg && <p role="alert" data-rv-unique-msg className="px-2 text-small text-warn">{uniqueMsg}</p>}
            <PropertyList fields={fields} values={values} onChange={guarded} onOptionsChange={onOptionsChange} />
            {after}
        </div>
    );
    return (
        <div className="-mx-4 h-full">
            {pd
                ? <pd.PageDoc host={host} docKey={id} value={node.body} onChange={(v) => (onBody ? onBody(v) : nodes.setBody(id, v))} onRename={onRename} properties={props} />
                : (
                    <nodes.Frame nodeId={id} onRename={onRename} width="page" scroll>
                        {props}
                        <p className="mt-3 text-small text-muted">페이지 편집기를 켜면 이 줄에 문서를 쓸 수 있습니다.</p>
                    </nodes.Frame>
                )}
        </div>
    );
}
