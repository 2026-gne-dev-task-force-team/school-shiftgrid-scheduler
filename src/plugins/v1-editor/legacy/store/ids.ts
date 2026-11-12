/** 고유 id — 접두사 + 순번 + 난수. 파일 안에서만 유일하면 된다 */
let counter = 0;
export function uid(prefix: string): string {
    counter += 1;
    return `${prefix}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** ISO 시각 문자열 (판 만든 시각 등) */
export function nowIso(): string {
    return new Date().toISOString();
}
