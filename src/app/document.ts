/**
 * 문서(프로젝트 파일) — P3. 「표 하나가 파일 하나」(기둥 2)의 바닥이자, 플러그인이 파일을 넘기는 창구.
 *
 * 🔴 두 성질이 갈린다(창틀 설계 「화면의 성질은 자료의 성질이 아니다」와 같다):
 *   - 플러그인 설정(기기별)  → host.storage (여기 아님)
 *   - 문서 데이터(프로젝트 파일) → 여기. 열기·저장·새 문서·임시 보관은 전부 호스트(app)가 쥔다.
 *
 * ⭐ 플러그인 데이터는 plugins.<id> 아래 제 칸만(요구명세 갈림길 ③). 창틀·앱은 plugins.* 안을 모른다.
 * 🔴 v1(schemaVersion 1~3) · 옛 v2(4·5) 파일을 연다 — 모르는 것·옮기지 못한 것은 legacy 에 통째로.
 *    ⛔ 「모르는 모양이면 빈 배열」 금지(옛 v1 migrateDoc 의 버릇). 통째로 들고 다니고, 변환 전후 항목 수를 검산한다.
 *    도메인 변환(v1 tracks → 카드·노드)은 **플러그인 몫**이다 — 호스트는 legacy 를 통째로 보존만 한다.
 *
 * 🔴 저장은 늘 「다른 이름으로」 — 원본 파일을 구조적으로 못 덮는다(기둥 4). 디스크 쓰기는 사용자가 누른다.
 *    자동 저장은 임시 보관(기기별 localStorage)으로만 — 열어 둔 파일을 덮지 않는다.
 *
 * 📌 이 파일은 둘로 자란다: (아래) ①순수 모델·변환·검산 — 테스트가 직접 검산한다.
 *    ②React 스토어 + host.doc 다리 + 열기/저장/임시 보관 — 부수효과가 산다(P3 커밋 ②에서 붙는다).
 */

// ══════════════════════════════════════════════════════════════
//  ① 순수 — 모델 · 변환 · 검산
// ══════════════════════════════════════════════════════════════

/** 지금 판 — main 의 5(Project) 다음. 이 판은 「플러그인별 칸」이 뼈대다 */
export const DOC_SCHEMA_VERSION = 6 as const;

/** 파일 확장자 — v1·옛 v2 와 같은 자리(선생님이 아는 이름). 저장은 늘 이걸 붙인다 */
export const DOC_EXT = '.shiftgrid.json';

/** 문서 한 장. plugins.<id> 가 그 플러그인의 몫(호스트는 안 읽는다) · legacy 는 못 옮긴 원본 통째 */
export interface Doc {
    schemaVersion: typeof DOC_SCHEMA_VERSION;
    meta: { name: string; createdAt: string; updatedAt: string };
    plugins: Record<string, unknown>;
    /** v1 · 옛 v2 원본 통째(모르는 것도 버리지 않는다). 새 문서면 없음 */
    legacy?: unknown;
}

/**
 * 변환 리포트 — 옛 파일을 열 때만 생긴다(v6 파일·새 문서는 null).
 * 🔴 ok=false 면 저장을 막는다 — 변환 전후로 들고 있는 항목 수가 안 맞으면 뭔가를 잃은 것이다.
 */
export interface DocMigrationReport {
    ok: boolean;
    /** 원본이 들고 있던 항목(모든 배열 원소, 깊이 무관) 총수 */
    sourceTotal: number;
    /** 변환 뒤 legacy 가 들고 있는 항목 총수 — 호스트는 legacy 를 통째로 보존하니 sourceTotal 과 같아야 한다 */
    heldTotal: number;
}

/**
 * 항목 수 — 구조 어디에 있든 모든 배열의 원소를 센다(깊이 무관).
 * 🔴 「통째로 들고 간다」가 참인지 재는 자. deepClone 은 이 값을 글자 하나 안 바꾼다.
 */
export function countItems(v: unknown): number {
    if (Array.isArray(v)) {
        let n = v.length;
        for (const x of v) n += countItems(x);
        return n;
    }
    if (v && typeof v === 'object') {
        let n = 0;
        for (const x of Object.values(v as Record<string, unknown>)) n += countItems(x);
        return n;
    }
    return 0;
}

/** JSON 으로 왕복 가능한 값만 다룬다 — structuredClone 이 없을 수도 있어 JSON 경유 */
function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

/** 이 객체가 「지금 판 문서」인가 — plugins 칸이 있고 schemaVersion 이 6 이면 v6 파일(옛 파일엔 plugins 가 없다) */
export function isDocV6(raw: unknown): raw is Doc {
    if (!raw || typeof raw !== 'object') return false;
    const o = raw as Record<string, unknown>;
    return o.schemaVersion === DOC_SCHEMA_VERSION && !!o.plugins && typeof o.plugins === 'object' && !Array.isArray(o.plugins);
}

/** 새 문서 — 빈 작업대(기둥 1). 아무것도 안 묻는다 */
export function newDoc(name = '제목 없음'): Doc {
    const now = new Date().toISOString();
    return { schemaVersion: DOC_SCHEMA_VERSION, meta: { name, createdAt: now, updatedAt: now }, plugins: {} };
}

/** v6 파일을 안전하게 받아들인다 — 모양만 맞추고 plugins·legacy 는 통째로 보존한다 */
export function normalizeV6(raw: Doc): Doc {
    const o = raw as unknown as Record<string, unknown>;
    const meta = (o.meta && typeof o.meta === 'object') ? (o.meta as Record<string, unknown>) : {};
    const now = new Date().toISOString();
    return {
        schemaVersion: DOC_SCHEMA_VERSION,
        meta: {
            name: typeof meta.name === 'string' ? meta.name : '제목 없음',
            createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
            updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now,
        },
        // 🔴 plugins 를 통째로 보존한다 — 꺼진·모르는 플러그인의 몫도 그대로 들고 간다
        plugins: (o.plugins && typeof o.plugins === 'object') ? { ...(o.plugins as Record<string, unknown>) } : {},
        legacy: 'legacy' in o ? o.legacy : undefined,
    };
}

/** 옛 파일에서 문서 이름을 찾는다 — v2 는 name, v1 은 meta.name. 못 찾으면 기본 이름 */
function extractLegacyName(raw: unknown): string {
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o.name === 'string' && o.name) return o.name;
        const meta = o.meta;
        if (meta && typeof meta === 'object') {
            const mn = (meta as Record<string, unknown>).name;
            if (typeof mn === 'string' && mn) return mn;
        }
    }
    return '불러온 문서';
}

/**
 * 옛 파일(v1·옛 v2) → 지금 판 문서.
 * 🔴 raw 를 통째로 legacy 에 깊은 복제해 보관한다 — 어떤 모양이 와도 한 항목도 잃지 않는다.
 *    도메인 변환(tracks → 카드)은 **여기서 안 한다** — 플러그인이 legacy 를 읽어 제 칸을 채운다.
 */
export function migrateToDoc(raw: unknown): { doc: Doc; report: DocMigrationReport } {
    const now = new Date().toISOString();
    const legacy = deepClone(raw);
    const doc: Doc = {
        schemaVersion: DOC_SCHEMA_VERSION,
        meta: { name: extractLegacyName(raw), createdAt: now, updatedAt: now },
        plugins: {},
        legacy,
    };
    const sourceTotal = countItems(raw);
    const heldTotal = countItems(doc.legacy);
    return { doc, report: { ok: sourceTotal === heldTotal, sourceTotal, heldTotal } };
}

/** 파일 글자 → 문서. v6 면 그대로, 그 밖(v1·옛 v2)은 legacy 로 통째 감싼다 */
export function parseDocFile(text: string): { doc: Doc; report: DocMigrationReport | null } {
    const raw = JSON.parse(text) as unknown;
    if (isDocV6(raw)) return { doc: normalizeV6(raw), report: null };
    return migrateToDoc(raw);
}

/**
 * 저장 직전 관문 — legacy 가 열 때 그대로인지 다시 센다.
 * 🔴 ⛔ 여기 「===」(항목 수 비교)가 무결성의 전부다 — 이 비교를 빼면 잃어버린 것을 못 잡는다(버그 심기 자리).
 *    sourceTotal 은 열 때의 리포트가 쥐고 있던 기준값이다.
 */
export function verifyDocIntegrity(doc: Doc, sourceTotal: number): DocMigrationReport {
    const heldTotal = countItems(doc.legacy);
    return { ok: sourceTotal === heldTotal, sourceTotal, heldTotal };
}

/**
 * 한 플러그인의 칸만 바꾼다 — ⭐ update 는 자기 키만(남의 몫·legacy 는 손대지 않는다).
 * 「편하니까 전체를 넘기면 남의 몫을 지우는 버그가 조용히 난다」(요구명세 「여기서 죽는다」).
 */
export function setSlice(doc: Doc, pluginId: string, value: unknown): Doc {
    return {
        ...doc,
        meta: { ...doc.meta, updatedAt: new Date().toISOString() },
        plugins: { ...doc.plugins, [pluginId]: value },
    };
}

/** 문서 → 파일 글자. 저장 때 updatedAt 을 갱신한다(들여쓰기 1칸 — 옛 판과 같은 결) */
export function serializeDoc(doc: Doc): string {
    return JSON.stringify({ ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } }, null, 1);
}
