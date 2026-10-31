/**
 * 저장된 옛 워크스페이스 살려 읽기 — 맨 viewId(sheet·settings·outline·props)를 데모 플러그인 id 로 옮긴다.
 *
 * 🔴 왜 여기(app)인가: 어느 맨 id 가 어느 플러그인 것인지는 **앱만 안다**(창틀은 플러그인을 모른다 — 검사 ⑤·⑦).
 *    그래서 매핑 표는 app 에 두고, loadWorkspace() 결과를 한 번 통과시킨다. 저장은 다음 저장 때 새 id 로 굳는다.
 *
 * ⛔ 모르는 viewId 는 손대지 않는다 — 그대로 들고 간다(EditorArea 가 제목만 옅게 그린다).
 */
import type { Workspace, Node, Leaf } from '../pane-ui-system';

/** 맨 id → 플러그인 id. 새 플러그인이 옛 id 를 물려받으면 여기 한 줄.
 *  📌 설정은 코어 settings 플러그인으로 이사했다(demo.settings 저장분도 settings.main 으로 옮긴다). */
const LEGACY_VIEW_IDS: Record<string, string> = {
    sheet: 'demo.sheet',
    settings: 'settings.main',
    'demo.settings': 'settings.main',
    outline: 'demo.outline',
    props: 'demo.props',
};

function mapLeaf(l: Leaf): Leaf {
    const viewId = LEGACY_VIEW_IDS[l.viewId] ?? l.viewId;
    return viewId === l.viewId ? l : { ...l, viewId };
}

function mapNode(n: Node | null): Node | null {
    if (!n) return n;
    if (n.kind === 'leaf') return mapLeaf(n);
    if (n.kind === 'tabs') return { ...n, children: n.children.map(mapLeaf) };
    return { ...n, children: n.children.map(mapNode).filter((c): c is Node => c !== null) };
}

export function migrateViewIds(ws: Workspace): Workspace {
    return {
        left: mapNode(ws.left),
        center: mapNode(ws.center) ?? ws.center,
        right: mapNode(ws.right),
        floating: ws.floating.map(mapLeaf),
    };
}
