/**
 * 레코드 열기 페이지 한 벌(Q5 R5) — 노드 틀(nodes.Frame) + 속성 목록(PropertyList) + 본문(page-doc).
 *   컬렉션 항목·달력·계정·레코드 뷰 행의 열기 화면이 전부 이걸 쓴다 — 옛 세 벌(ItemPeek·EventCardPeek·account RecordPage)의 겉틀이 사라졌다.
 *   🔴 머리(아이콘·제목)·경로·⋯ 메뉴는 틀이 쥔다 — 여기선 칸과 본문만 놓는다. 틀은 피크 안이면 피크 머리줄에 윗줄을 그린다.
 *   🔴 page-doc 이 꺼져 있으면 문서 없이 틀 + 칸만 — 본문 편집기는 페이지 편집기 꾸러미 몫이다.
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입(값은 host.modules.use).
import type { NodesApi } from '../../explorer/contracts/nodes';
import type { PageDocApi } from '../../page/contracts/page-doc';
import type { RecordPageProps } from '../contracts/collection';
import { PropertyList } from './PropertyList';

export function RecordPage({ host, id, fields, values, onChange, onOptionsChange, after, onRename, onBody }: RecordPageProps & { host: PluginHost }) {
    const nodes = host.modules.use<NodesApi>('nodes');
    const node = nodes?.get(id);
    if (!nodes || !node) return <p className="text-small text-muted">이 줄이 없어졌습니다.</p>;
    const pd = host.modules.use<PageDocApi>('page-doc');
    const props = (
        <div className="flex flex-col gap-3">
            <PropertyList fields={fields} values={values} onChange={onChange} onOptionsChange={onOptionsChange} />
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
