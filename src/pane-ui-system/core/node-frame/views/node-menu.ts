/**
 * 노드 메뉴 한 목록 — 탐색기 우클릭과 노드 틀(⋯ · 빈 곳 우클릭)이 **같은 항목·같은 순서**를 이 함수 하나에서 받는다(R3 S9).
 *   순서(K23 묶음): 열기류(열기·본문이 보탠 것·탐색기에서 보기) → 새로 만들기(많으면 「새로 만들기 ▸」 하위 메뉴) → 편집(이름 바꾸기·아이콘 바꾸기·타입 menu 기본) →
 *   옮기기(위로/아래로·group:'move' 타입 항목) → 위험(삭제) — 묶음 사이에 구분선. 타입 menu 항목은 group 키로 묶음을 고른다(없으면 편집).
 *   각 줄은 해당 때만 낀다(열기=탐색기 전용 · 탐색기에서 보기=틀 전용 · 위로/아래로=형제가 있을 때). 모든 동작은 같은 명령 id 를 부른다.
 *   ⛔ 복제·링크 복사·새 탭/옆으로 열기는 아직 명령이 없다 — 생기면 여기 한 곳에 줄을 더한다(두 메뉴가 같이 는다).
 */
import type { MenuEntry, MenuGroup } from '../../..';
import { CMD } from '../../nodes/contracts/commands';
import { parentOf } from '../../nodes/model/tree';
import { canDo, typeMenu } from '../../nodes/model/types';
import { getState, nudgeSelected, openById, select } from '../../node-store/store';

export interface NodeMenuOpts {
    /** 탐색기 줄이면 참 — 열기·위로·아래로가 명령 id 로 간다(고른 줄 기준). 틀은 거짓 — 이 노드를 직접 부른다. */
    viaCommands?: boolean;
    /** 열기 줄을 낼까(이미 열려 있는 틀에선 안 준다) */
    open?: boolean;
    /** 편집 묶음에 더할 항목(탐색기: 아이콘 바꾸기) — 이름 바꾸기 바로 뒤 */
    edit?: MenuEntry[];
    /** 본문이 보탠 항목(열기 묶음) */
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

/** 「새로 만들기」 줄이 이만큼(구분선 뺀 수) 넘으면 하위 메뉴로 접는다 */
const CREATE_FOLD_MIN = 4;
const GROUP_ORDER: MenuGroup[] = ['open', 'new', 'edit', 'move', 'danger'];

export function nodeMenu(nodeId: string, o: NodeMenuOpts): MenuEntry[] {
    const tree = getState().tree;
    const node = tree.nodes[nodeId];
    if (!node) return [];
    const g: Record<MenuGroup, MenuEntry[]> = { open: [], new: [], edit: [], move: [], danger: [] };
    if (o.open) g.open.push({ label: '열기', icon: 'arrowRight', commandId: o.viaCommands ? CMD.open : undefined, onClick: () => openById(nodeId) });
    if (o.extra?.length) g.open.push(...o.extra);
    if (o.reveal) g.open.push({ label: '탐색기에서 보기', icon: 'folder', onClick: o.reveal });
    if (o.create?.length) {
        const n = o.create.filter((it) => !it.sep).length;
        g.new.push(...(n > CREATE_FOLD_MIN ? [{ label: '새로 만들기', icon: 'plus' as const, children: o.create }] : o.create));
    }
    g.edit.push({
        label: '이름 바꾸기', icon: 'edit', disabled: !!o.renameBlocked || !canDo(node.type, nodeId, 'rename'),
        commandId: o.rename.commandId, onClick: o.rename.run,
    });
    if (o.edit?.length) g.edit.push(...o.edit);
    if (o.move) {
        const sibs = tree.nodes[parentOf(tree, nodeId) ?? '']?.children ?? [];
        const at = sibs.indexOf(nodeId);
        if (sibs.length > 1) {
            const nudge = (d: -1 | 1) => () => { select(nodeId); nudgeSelected(d); };
            g.move.push({ label: '위로', icon: 'up', commandId: o.viaCommands ? CMD.moveUp : undefined, onClick: nudge(-1), disabled: at <= 0 });
            g.move.push({ label: '아래로', icon: 'down', commandId: o.viaCommands ? CMD.moveDown : undefined, onClick: nudge(1), disabled: at < 0 || at >= sibs.length - 1 });
        }
    }
    for (const it of typeMenu(node, nodeId)) {
        // 「열기」가 이미 있으면 타입 menu 의 「○○ 열기」는 뺀다 — 같은 노드를 같은 open 으로 연다
        if (o.open && !it.sep && it.label.endsWith(' 열기') && it.commandArg?.nodeId === nodeId) continue;
        g[(!it.sep && it.group) || 'edit'].push(it);
    }
    g.danger.push({
        label: o.remove.label ?? '삭제', icon: 'trash', danger: true, disabled: !canDo(node.type, nodeId, 'delete'),
        commandId: o.remove.commandId, onClick: o.remove.run,
    });
    const out: MenuEntry[] = [];
    for (const k of GROUP_ORDER) {
        if (!g[k].length) continue;
        if (out.length) out.push({ sep: true });
        out.push(...g[k]);
    }
    return out;
}
