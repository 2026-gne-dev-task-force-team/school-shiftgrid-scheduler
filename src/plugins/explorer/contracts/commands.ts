/**
 * 🔴 탐색기 꾸러미가 내놓는 명령 id — 다른 꾸러미는 명령을 글자로 부르지 말고 이 상수로 부른다(톱니 cmdIdString).
 *   ⭐ 값은 순수 글자 상수뿐(함수 0). 구조 검사 (d) 「남의 약속은 import type 만」을 지키려, 값은 약속 모듈로 받는다:
 *        const nodes = host.modules.use<NodesApi>('nodes');  host.commands.run(nodes.cmd.undo, { args })
 *      타입만 필요하면 `import type { ExplorerCmdId } from '../explorer/contracts/commands'`.
 *   ⚠️ 매니페스트(index.ts contributes.commands)의 id 와 한 벌이어야 한다 — commands.test 가 둘을 맞춰 본다.
 */
export const CMD = {
    openPanel: 'explorer.open-panel',
    rename: 'explorer.rename',
    remove: 'explorer.remove',
    open: 'explorer.open',
    moveUp: 'explorer.move-up',
    moveDown: 'explorer.move-down',
    restore: 'explorer.restore',
    askPurge: 'explorer.ask-purge',
    askPurgeAll: 'explorer.ask-purge-all',
    undo: 'explorer.undo',
    redo: 'explorer.redo',
} as const;

/** 탐색기 명령 id 하나 */
export type ExplorerCmdId = (typeof CMD)[keyof typeof CMD];

/** explorer.undo 의 args — 알림 「되돌리기」가 싣는 대상 토큰(되돌리기 더미 맨 위 칸). 맞을 때만 되돌린다. */
export interface UndoArgs { undoTop: number }
