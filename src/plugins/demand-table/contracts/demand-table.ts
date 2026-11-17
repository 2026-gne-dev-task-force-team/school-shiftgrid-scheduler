/**
 * 🔴 약속 「demand-table」 0.1.0 — 시수표 조각이 내놓는 것은 지금 화면 여는 명령 id 뿐(값 0).
 *   소비자(자동 편성 막힘 「열기」 등)는 host.modules.use<DemandTable>('demand-table').cmd.open 으로 받는다.
 */
import type { CMD } from './commands';

export interface DemandTable {
    readonly version: 1;
    /** 명령 id 상수 — host.commands.run(demandTable.cmd.open). */
    readonly cmd: Readonly<Record<keyof typeof CMD, string>>;
}
