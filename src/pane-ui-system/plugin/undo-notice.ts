/**
 * 「알림 + 되돌리기」 공용 — 지운 직후 알림에 「되돌리기」 단추를 다는 꼴은 이 파일 하나로만 짠다(R3-U).
 *   꾸러미가 host.notify 의 되돌리기 단추(action) 를 손으로 다시 짜면 ratchet(ownUndoNotice)이 빨개진다.
 *   - notifyUndo      : 바닥 — 명령 id(+args)로 가는 되돌리기 단추 알림 한 건.
 *   - notifyNodeUndo  : 노드 되돌리기 명령 + 방금 쌓인 더미 칸 토큰(undoTop) — 뒤에 다른 작업이 쌓이면 단추가 회색.
 *   - createUndoSlot  : 꾸러미 제 되돌리기(편집기·표 내장 더미)를 「실행 함수 + 맨 위냐」 한 칸으로 쥐는 꼴.
 */
import type { JsonValue } from '../json';
import type { PluginHost } from './types';

export const UNDO_LABEL = '되돌리기';
export const UNDO_UNAVAILABLE = '이미 다른 작업이 있어 되돌릴 수 없습니다';
export const UNDO_TIMEOUT = 8000;

type Notifier = Pick<PluginHost, 'notify'>;

export interface NotifyUndoInput {
    title: string;
    /** 같은 보낸이의 같은 key 는 떠 있는 토스트만 덮는다 */
    key: string;
    /** 되돌리기 명령 — 없으면 단추 없이 알림만 */
    commandId?: string;
    args?: JsonValue;
    /** 단추가 회색일 때 까닭 — 기본 UNDO_UNAVAILABLE */
    unavailable?: string;
    /** ms — 기본 UNDO_TIMEOUT */
    timeout?: number;
}

/** 바닥 — 되돌리기 단추가 붙은 알림 한 건. 알림 id 를 돌려준다. */
export function notifyUndo(host: Notifier, input: NotifyUndoInput): string {
    const { title, key, commandId, args, unavailable = UNDO_UNAVAILABLE, timeout = UNDO_TIMEOUT } = input;
    return host.notify({
        title, key, timeout,
        action: commandId ? { label: UNDO_LABEL, commandId, args, unavailable } : undefined,
    });
}

/** 노드 창구가 내는 되돌리기 — 필요한 것만 구조로 받는다(꾸러미마다 NodesApi 사본이 달라서). */
export interface NodeUndoSource { cmd: { undo: string }; undoToken(): number | null }

/** 노드 되돌리기 알림 — 호출 직전에 지우기를 끝내 두면 그 칸의 토큰이 붙는다. 창구가 없거나 토큰이 없으면 단추 없이 알린다. */
export function notifyNodeUndo(host: Notifier, nodes: NodeUndoSource | null | undefined, title: string, key: string): string {
    const token = nodes?.undoToken() ?? null;
    return notifyUndo(host, {
        title, key,
        commandId: nodes && token !== null ? nodes.cmd.undo : undefined,
        args: { undoTop: token },
    });
}

export interface UndoSlot {
    /** 알림을 띄우고 run/isTop 을 쥔다 — 새 알림이 이전 것을 덮는다(마지막 한 건만 산다). */
    notify(host: Notifier, title: string, run: () => void, isTop: () => boolean): void;
    /** 명령 enabled 에 — 되돌릴 수 있나 */
    undoable(): boolean;
    /** 명령 run 에 — 맨 위일 때만 되돌린다 */
    undo(): void;
}

/** 꾸러미 제 되돌리기 한 칸 — commandId 는 꾸러미가 계약한 「…undoRemoved」 명령(undoable/undo 를 연결한다). */
export function createUndoSlot(opts: { commandId: string; key: string }): UndoSlot {
    let slot: { run: () => void; isTop: () => boolean } | null = null;
    return {
        notify(host, title, run, isTop) {
            slot = { run, isTop };
            notifyUndo(host, { title, key: opts.key, commandId: opts.commandId });
        },
        undoable: () => !!slot?.isTop(),
        undo() { if (slot?.isTop()) slot.run(); },
    };
}
