/**
 * 🔴 약속 「v1-file」 0.1.0 — v1 파일 호환 조각이 내놓는 명령 id(글자 상수뿐 · 함수 0).
 *   다른 조각(편성안 화면 등)은 명령 id 를 글자로 부르지 않고 host.modules.use<V1File>('v1-file').cmd.open 으로 받는다.
 *   ⚠️ 매니페스트(index.ts contributes.commands)의 id 와 한 벌이어야 한다.
 */
export const CMD = {
    open: 'v1-file.open',
} as const;

export interface V1File {
    readonly version: 1;
    /** 명령 id 상수 — host.commands.run(v1File.cmd.open). */
    readonly cmd: typeof CMD;
}
