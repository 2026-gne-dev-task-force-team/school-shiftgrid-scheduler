// 시간표 판 고르기(설계 ① 3절 「시간표 판본」 · 16절 D3) — 서버(parts/doc.ts)와 화면이 같은 판정을 쓰게 순수 함수로 둔다.
// 규칙(운영 앱 versionFor): 그날을 덮는 기간의 판 중 최신, 하나도 없으면 최신.
// 최신 순서 = 지금 판 `doc` > 보관 칸 `doc@<n>` 의 n 큰 쪽(n = 보관될 때의 옛 판 번호라 클수록 나중 판이다).

/** 판이 쓰이는 기간(YYYY-MM-DD, null = 그쪽 끝 제한 없음) */
export interface DocPeriod {
    validFrom: string | null;
    validTo: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v: unknown): string | null => (typeof v === 'string' && DATE.test(v) ? v : null);

/** 날짜가 기간 안인가 — 양 끝 포함. 끝이 null 이면 그쪽은 열려 있다(기간 없는 옛 판은 언제나 맞다). */
export const inPeriod = (p: DocPeriod, date: string): boolean =>
    (p.validFrom == null || p.validFrom <= date) && (p.validTo == null || date <= p.validTo);

/**
 * doc 조각 본문에서 기간을 읽는다. 본문 꼴은 둘이다.
 * - 감싼 꼴 `{doc, validFrom, validTo}`(설계 ① 3절) → 그 기간(날짜 꼴이 아니면 null 로 본다)
 * - 기간 없는 옛 판(시간표 v3 꼴을 그대로 둔 것) → 양 끝 null
 */
export function periodOf(body: unknown): DocPeriod {
    if (!isWrapped(body)) return { validFrom: null, validTo: null };
    return { validFrom: asDate(body.validFrom), validTo: asDate(body.validTo) };
}

/** doc 조각 본문 → 시간표(v3 꼴) 자체. 감싼 꼴이면 `.doc`, 옛 판이면 본문 그대로. */
export function docOf(body: unknown): unknown {
    return isWrapped(body) ? body.doc : body;
}

function isWrapped(body: unknown): body is { doc: unknown; validFrom?: unknown; validTo?: unknown } {
    return typeof body === 'object' && body !== null && !Array.isArray(body) && 'doc' in body;
}

/** 조각 이름 → 보관 번호(`doc@12` → 12). 지금 판 `doc` 이나 다른 이름이면 null. */
export function archiveNumberOf(part: string): number | null {
    const m = /^doc@(\d+)$/.exec(part);
    return m ? Number(m[1]) : null;
}

/** 판 이름들을 최신 순으로 — `doc` 먼저, 그다음 `doc@<n>` 의 n 큰 쪽. 다른 이름은 버린다. */
export function newestFirst(parts: readonly string[]): string[] {
    const archives = parts
        .map((p) => ({ p, n: archiveNumberOf(p) }))
        .filter((x): x is { p: string; n: number } => x.n !== null)
        .sort((a, b) => b.n - a.n)
        .map((x) => x.p);
    return [...(parts.includes('doc') ? ['doc'] : []), ...archives];
}

/**
 * 최신 순으로 늘어놓은 판들 중 그날 쓸 판 — 기간이 맞는 것 중 첫째(=최신), 없으면 첫째(=최신). 빈 목록이면 null.
 * 화면 쪽 `VersionStore.pick` 과 같은 판정이다.
 */
export function pickVersion<T>(newest: readonly T[], period: (v: T) => DocPeriod, date: string): T | null {
    return newest.find((v) => inPeriod(period(v), date)) ?? newest[0] ?? null;
}
