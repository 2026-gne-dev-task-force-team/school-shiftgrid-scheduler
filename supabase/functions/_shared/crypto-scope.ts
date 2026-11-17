// 여는 범위·평문 0 — ① 16절 D6 · ④ 10절.
// 1) 여는 범위 표: 어느 함수가 어느 암호문 칸(종류·조각 이름)을 열어도 되는지 한 곳에서 정한다. 표에 없으면 열지 못한다.
// 2) 평문 0 로그: 평문이 로그·오류 응답·감사 평문 열로 새지 않게 하는 얇은 도구(safeLog · scopeError).
// 순수 함수(Deno·Node 공용). 열기 자체(envelope.open)는 여기서 하지 않는다 — 열기 전에 assertMayOpen 을 부르는 자리다.
//   부르는 자리(T-10ha): _shared/doc.ts openRowBody · parts/handler.ts openOr500 · sub/rows.ts openSlot · sub/index.ts 표시명
//   · rooms/store.ts toReservation · rooms/index.ts 칸·표시명 · account/handler.ts openDocBody·프로젝트 이름.

/** 암호문 칸 종류 — aad.ts 의 AAD 종류와 같은 낱말 */
export type OpenKind = 'part' | 'sub' | 'room' | 'audit' | 'user' | 'project';

export type FnName = 'parts' | 'sub' | 'rooms' | 'account' | 'admin-ops' | 'health';

/** 조각 이름 — access.ts PART_WRITERS 의 키 + 보관본 `doc@<n>` */
const KNOWN_PART = /^(doc(@\d+)?|ops\.(rooms|calendar|changes|fixed|classSubjects|aux|settings|installed))$/;

interface Scope {
    /** 열어도 되는 칸 종류 */
    kinds: readonly OpenKind[];
    /** `part` 종류일 때 열어도 되는 조각 이름(`*` = 전부 · 모르는 이름도 안 됨 · `doc@<n>` 보관본은 `*` 나 `doc@*` 만) */
    parts: readonly string[] | '*';
}

/**
 * 여는 범위 표.
 * - parts: GET 이 구성원에게 돌려주려고 조각 전부를 열고, PUT 이 옛 판·보관 doc 을 연다.
 * - sub: 그날 입력(doc + 곁 조각 다섯 SIDE_PARTS) · 그날 기간에 맞는 보관 doc(`doc@*`, parts/doc.ts openDocFor) · 보결 행 · 구성원 표시명(user). 감사는 쓰기만(열지 않는다).
 * - rooms: 특별실 조각 `ops.rooms`·`doc`(칸 머리 — 아직 안 이음)과 예약 행 · 예약자 표시명(user). 감사는 쓰기만.
 * - account: 구성원 목록용 `doc`(사람 목록)·계정 이름·프로젝트 이름.
 * - admin-ops: 키 교체(rewrap)는 모든 칸을 풀었다 다시 잠근다.
 * - health: 아무것도 열지 않는다.
 */
export const OPEN_SCOPE: Readonly<Record<FnName, Scope>> = {
    parts: { kinds: ['part'], parts: '*' },
    sub: { kinds: ['part', 'sub', 'user'], parts: ['doc', 'doc@*', 'ops.fixed', 'ops.calendar', 'ops.changes', 'ops.classSubjects', 'ops.aux'] },
    rooms: { kinds: ['part', 'room', 'user'], parts: ['doc', 'ops.rooms'] },
    account: { kinds: ['part', 'user', 'project'], parts: ['doc'] },
    'admin-ops': { kinds: ['part', 'sub', 'room', 'audit', 'user', 'project'], parts: '*' },
    health: { kinds: [], parts: [] },
};

/** 범위 밖 열기 시도 — 메시지엔 함수 이름·칸 종류·(알려진) 조각 이름만. 평문·입력값은 넣지 않는다. */
export class ScopeError extends Error {
    readonly fn: string;
    readonly kind: OpenKind;
    constructor(fn: string, kind: OpenKind, part?: string) {
        const p = part === undefined ? '' : ` part=${KNOWN_PART.test(part) ? part : '?'}`;
        super(`scope_denied fn=${fn} kind=${kind}${p}`);
        this.name = 'ScopeError';
        this.fn = fn;
        this.kind = kind;
    }
}

/** 열어도 되나(순수) */
export function mayOpen(fn: string, kind: OpenKind, part?: string): boolean {
    const s = (OPEN_SCOPE as Record<string, Scope | undefined>)[fn];
    if (!s || !s.kinds.includes(kind)) return false;
    if (kind !== 'part') return true;
    if (part === undefined || !KNOWN_PART.test(part)) return false;
    if (s.parts === '*') return true;
    return s.parts.includes(part) || (/^doc@\d+$/.test(part) && s.parts.includes('doc@*'));
}

/** 열기 직전에 부른다 — 범위 밖이면 ScopeError(부르는 쪽이 500 으로 바꾸고 e.message 만 로그에) */
export function assertMayOpen(fn: string, kind: OpenKind, part?: string): void {
    if (!mayOpen(fn, kind, part)) throw new ScopeError(fn, kind, part);
}

// ── 평문 0 로그 ─────────────────────────────────────────────

/** 로그 칸에 그대로 써도 되는 값 — 코드·id·숫자꼴만(공백·한글·따옴표 없음). 사람 이름·사유 같은 글은 못 지나간다. */
const SAFE_VALUE = /^[A-Za-z0-9._:@/+=-]{0,64}$/;

/**
 * 로그 한 줄을 만든다 — `code k=v …`. 값이 안전한 꼴이 아니면 `[redacted]`(값을 버린다).
 * 객체·배열·긴 글은 값이 아니라 꼴(`[object]`·`[array:3]`)만 적는다.
 */
export function logLine(code: string, fields: Record<string, unknown> = {}): string {
    const parts = [SAFE_VALUE.test(code) ? code : '[redacted]'];
    for (const [k, v] of Object.entries(fields)) {
        let s: string;
        if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
        else if (typeof v === 'string') s = SAFE_VALUE.test(v) ? v : '[redacted]';
        else if (Array.isArray(v)) s = `[array:${v.length}]`;
        else if (v === null || v === undefined) s = '-';
        else s = '[object]';
        parts.push(`${SAFE_VALUE.test(k) ? k : '?'}=${s}`);
    }
    return parts.join(' ');
}

/** 오류 로그 — console.error 에 logLine 만 보낸다. 오류 객체·메시지는 싣지 않는다(복호 오류가 평문을 품을 수 있어서). */
export function safeLog(code: string, fields: Record<string, unknown> = {}): void {
    console.error(logLine(code, fields));
}

/** 시험·점검용: 글 속에 심은 이름이 있나(있는 이름만 돌려준다) */
export function findPlanted(text: string, planted: readonly string[]): string[] {
    return planted.filter((p) => text.includes(p));
}
