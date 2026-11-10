/**
 * 깨진 항목 — 저장소 레코드의 type·name·children 이 null/잘못된 값이라 노드로 못 읽을 때, 버리지 않고 이 꼴로 보존한다(QA Q21).
 *   🔴 원래 레코드(raw)를 data 에 쥐고 있다가 저장할 때 그대로 되돌려 쓴다 — 자동 복구로 자료를 바꾸지 않는다(휴지통 이동 표식만 얹는다).
 */
import type { Node } from '../contracts/nodes';

export const BROKEN_TYPE = 'explorer.broken';

export interface BrokenData { reasons: string[]; raw: Record<string, unknown> }

/** 레코드가 노드로 못 읽히는 까닭들 — 비면 성한 노드. */
export function brokenReasons(n: Record<string, unknown>): string[] {
    const out: string[] = [];
    if (typeof n.type !== 'string' || !n.type) out.push(n.type == null ? 'type 없음' : 'type 이 글자가 아님');
    if (typeof n.name !== 'string') out.push(n.name == null ? 'name 없음' : 'name 이 글자가 아님');
    if (n.children !== undefined && !Array.isArray(n.children)) out.push(n.children == null ? 'children 없음(null)' : 'children 이 목록이 아님');
    return out;
}

export function brokenNode(id: string, n: Record<string, unknown>, reasons: string[]): Node {
    const data: BrokenData = { reasons, raw: n };
    return {
        id,
        type: BROKEN_TYPE,
        name: typeof n.name === 'string' && n.name ? n.name : id,
        children: Array.isArray(n.children) ? n.children.filter((c): c is string => typeof c === 'string') : [],
        data,
    };
}

export function brokenDataOf(node: Node | undefined): BrokenData | null {
    if (!node || node.type !== BROKEN_TYPE) return null;
    const d = node.data as Partial<BrokenData> | undefined;
    return d && Array.isArray(d.reasons) && d.raw && typeof d.raw === 'object' ? (d as BrokenData) : null;
}
