/**
 * 노드 메뉴 한 목록 — 탐색기 우클릭과 노드 틀(⋯ · 빈 곳 우클릭)이 **같은 항목·같은 순서**를 이 함수 하나에서 받는다(R3 S9).
 *   순서(노션): 열기 · 본문이 보탠 것 · 이름 바꾸기 · 탐색기에서 보기 · 하위 새로 만들기 · 위로/아래로 · 타입 menu · 구분선 · 삭제(위험색).
 *   각 줄은 해당 때만 낀다(열기=탐색기 전용 · 탐색기에서 보기=틀 전용 · 위로/아래로=형제가 있을 때). 모든 동작은 같은 명령 id 를 부른다.
 *   ⛔ 복제·링크 복사·새 탭/옆으로 열기는 아직 명령이 없다 — 생기면 여기 한 곳에 줄을 더한다(두 메뉴가 같이 는다).
 */
import type { MenuEntry } from '../../..';
import { CMD } from '../../nodes/contracts/commands';
import { parentOf } from '../../nodes/model/tree';
import { canDo, typeMenu } from '../../nodes/model/types';
import { getState, nudgeSelected, openById, select } from '../../node-store/store';

export interface NodeMenuOpts {
    /** 탐색기 줄이면 참 — 열기·위로·아래로가 명령 id 로 간다(고른 줄 기준). 틀은 거짓 — 이 노드를 직접 부른다. */
    viaCommands?: boolean;
    /** 열기 줄을 낼까(이미 열려 있는 틀에선 안 준다) */
    open?: boolean;
    /** 본문이 보탠 항목(맨 앞) */
    extra?: MenuEntry[];
    /** 이름 바꾸기 — 탐색기는 명령(고른 줄 기준), 틀은 제목칸 초점 */
    rename: { run: () => void; commandId?: string };
    /** 탐색기에서 보기(틀 전용) */
    reveal?: () => void;
    /** 하위 새로 만들기 후보(탐색기가 등록 표에서 만들어 준다) */
    create?: MenuEntry[];
    /** 위로/아래로 줄을 낼까(탐색기는 좁은 화면만 · 틀은 늘) */
    move?: boolean;
    /** 삭제 — 틀은 확인 창을 거치고, 탐색기는 명령으로 */
    remove: { run: () => void; commandId?: string; label?: string };
    /** 이름 바꾸기를 막을 때(여럿 고름) */
    renameBlocked?: boolean;
}

export function nodeMenu(nodeId: string, o: NodeMenuOpts): MenuEntry[] {
    const tree = getState().tree;
    const node = tree.nodes[nodeId];
    if (!node) return [];
    const out: MenuEntry[] = [];
    if (o.open) out.push({ label: '열기', icon: 'arrowRight', commandId: o.viaCommands ? CMD.open : undefined, onClick: () => openById(nodeId) });
    if (o.extra?.length) { if (out.length) out.push({ sep: true }); out.push(...o.extra, { sep: true }); }
    out.push({
        label: '이름 바꾸기', icon: 'edit', disabled: !!o.renameBlocked || !canDo(node.type, nodeId, 'rename'),
        commandId: o.rename.commandId, onClick: o.rename.run,
    });
    if (o.reveal) out.push({ label: '탐색기에서 보기', icon: 'folder', onClick: o.reveal });
    if (o.create?.length) out.push({ sep: true }, ...o.create);
    if (o.move) {
        const sibs = tree.nodes[parentOf(tree, nodeId) ?? '']?.children ?? [];
        const at = sibs.indexOf(nodeId);
        if (sibs.length > 1) {
            out.push({ sep: true });
            const nudge = (d: -1 | 1) => () => { select(nodeId); nudgeSelected(d); };
            out.push({ label: '위로', icon: 'up', commandId: o.viaCommands ? CMD.moveUp : undefined, onClick: nudge(-1), disabled: at <= 0 });
            out.push({ label: '아래로', icon: 'down', commandId: o.viaCommands ? CMD.moveDown : undefined, onClick: nudge(1), disabled: at < 0 || at >= sibs.length - 1 });
        }
    }
    const typed = typeMenu(node, nodeId);
    if (typed.length) out.push({ sep: true }, ...typed);
    out.push({
        sep: true,
    }, {
        label: o.remove.label ?? '삭제', icon: 'trash', danger: true, disabled: !canDo(node.type, nodeId, 'delete'),
        commandId: o.remove.commandId, onClick: o.remove.run,
    });
    return out;
}
