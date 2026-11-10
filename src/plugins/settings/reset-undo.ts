/**
 * 「전부 되돌리기·기본값」 알림 — 즉시 적용되는 초기화 뒤에 「되돌리기」 단추(이전 값 복원)를 알림으로 띄운다.
 *   확인창이 아니라 알림+되돌리기로 통일(컬렉션·시트 지우기 알림과 같은 결). 복원 함수는 토큰으로 쥔다(메모리 한정 — 새로고침하면 만료).
 */
import { notifyUndo, type PluginHost, type CommandContext } from '../../pane-ui-system/plugin';

const slots = new Map<number, () => void>();
let seq = 0;

export function notifyReset(host: PluginHost, title: string, restore: () => void): void {
    const token = ++seq;
    slots.set(token, restore);
    notifyUndo(host, { title, key: 'settings.reset', commandId: 'settings.undoReset', args: { token }, unavailable: '이미 되돌렸습니다' });
}

const tokenOf = (ctx?: CommandContext): number => Number((ctx?.args as { token?: number } | undefined)?.token);
export function resetUndoable(ctx?: CommandContext): boolean { return slots.has(tokenOf(ctx)); }
export function undoReset(ctx?: CommandContext): void {
    const t = tokenOf(ctx);
    const fn = slots.get(t);
    if (fn) { slots.delete(t); fn(); }
}
