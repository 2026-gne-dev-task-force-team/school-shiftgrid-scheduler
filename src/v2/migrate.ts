/**
 * ══════════════════════════════════════════════════════════════
 *  v1 파일 열기 (마이그레이션) — 여기가 제일 조심할 데
 * ══════════════════════════════════════════════════════════════
 *
 * 🔴 설계 [[시간표 짜기 v2 설계]] 「v1 파일이 v2 의 무엇이 되나」:
 *   반(Track) 하나        → 표(Sheet) 하나 (이름 = 반 이름)
 *   그 반의 TimetableSpec → 그 표의 시간 틀로 **복사** (공유 관계는 나중 모듈이 되살린다)
 *   SchoolMeta            → 프로젝트 속성 (학교 이름·학기)
 *   배치·수요·규칙·금지칸·시안·사람·과목·특별실 그 외 전부
 *                         → 🔴 **손대지 않고 통째로 보관** (화면엔 안 보여도 파일에 그대로 산다)
 *
 * 🔴 모르는 게 나와도 버리지 않는다 — v1 migrateDoc 의 「모르는 모양이면 빈 배열」 버릇은 금지다.
 *    통째로 들고 다니고 「이건 못 옮겼습니다」를 **세어** 화면에 보여준다.
 *    변환 전후로 들고 있는 항목 수가 안 맞으면 **저장을 막는다**(ok=false).
 *
 * ⛔ v1 의 migrateDoc 을 호출하지 않는다 — 배치·금지칸을 안 건드리니 부를 이유가 없고,
 *    그 함수엔 알려진 잔가지가 있다(설계 「여기서 죽는다」).
 */
import type { TimetableSpec } from '../types/schema';
import type { LegacyDoc, Project, Sheet } from './model';
import { V2_SCHEMA_VERSION } from './model';
import { defaultSpec } from './defaults';
import { uid } from '../store/ids';

/** 변환 리포트 — 무엇을 표로 폈고, 무엇을 「통째 보관」했고, 개수가 맞는지 */
export interface MigrationReport {
    /** 개수가 맞나 — false 면 저장을 막는다 */
    ok: boolean;
    /** 표로 편 개수 (= v1 반 수) */
    sheetCount: number;
    /** 「못 옮긴」(통째 보관한) 항목 종류별 개수 — 화면에 보여준다 */
    carried: Record<string, number>;
    /** 「못 옮긴」 항목 총합 */
    carriedTotal: number;
    /** 원본이 들고 있던 항목 총수 */
    sourceTotal: number;
    /** 변환 뒤 들고 있는 항목 총수 (표 + 보관) */
    heldTotal: number;
}

export interface MigrationResult {
    project: Project;
    report: MigrationReport;
}

/** 이 종류들은 「표」로 펴지 않고 통째로 보관한다(모르는 배열 키도 자동으로 여기 들어온다) */
const CARRIED_KEYS_HINT = [
    'agents', 'activities', 'resources', 'specs', 'timetables',
    'demands', 'assignments', 'blackouts', 'weeklyBlocks', 'rules', 'boards',
] as const;

const LABEL: Record<string, string> = {
    agents: '사람', activities: '과목', resources: '특별실', specs: '시간 틀',
    timetables: '시간표', demands: '수요', assignments: '배치', blackouts: '날짜 차단',
    weeklyBlocks: '금지칸', rules: '규칙', boards: '저장한 판',
};

/** 사람이 읽을 종류 이름 (모르는 키는 그대로) */
export function carriedLabel(key: string): string {
    return LABEL[key] ?? key;
}

/**
 * v1 원시 객체(JSON.parse 결과)를 v2 프로젝트로 편다.
 * 🔴 raw 를 통째로 legacy 에 깊은 복제해 보관한다 — 어떤 모양이 와도 한 항목도 잃지 않는다.
 */
export function migrateV1ToV2(raw: unknown): MigrationResult {
    const src: Record<string, unknown> = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};

    // ── 1. 프로젝트 속성 (학교 메타 → 프로젝트) ──
    const meta = (src.meta && typeof src.meta === 'object') ? (src.meta as Record<string, unknown>) : {};
    const name = typeof meta.name === 'string' && meta.name ? meta.name : '불러온 학교';
    const term = typeof meta.term === 'string' ? meta.term : '';

    // ── 2. 반(Track) → 표(Sheet). 그 반이 쓰던 시간 틀을 「복사」해 표에 싣는다 ──
    const tracks = asArray(src.tracks);
    const specs = asArray(src.specs);
    const specById = new Map<string, Record<string, unknown>>();
    for (const s of specs) {
        if (s && typeof s === 'object') {
            const id = (s as Record<string, unknown>).id;
            if (typeof id === 'string') specById.set(id, s as Record<string, unknown>);
        }
    }

    const sheets: Sheet[] = tracks.map((t) => {
        const tr = (t && typeof t === 'object') ? (t as Record<string, unknown>) : {};
        const trackName = typeof tr.name === 'string' && tr.name ? tr.name : '표';
        const specId = typeof tr.specId === 'string' ? tr.specId : undefined;
        const rawSpec = specId ? specById.get(specId) : undefined;
        const spec = rawSpec ? copySpec(rawSpec) : defaultSpec();
        return {
            id: uid('sheet'),
            name: trackName,
            spec,
            cells: {}, // 🔴 배치(assignments)는 통째 보관일 뿐 모듈 1 은 칸으로 펴지 않는다(화면엔 안 보임)
            // 🔴 owner 는 비운다 — 화면이 이 칸을 안 본다. 주인 붙이기는 다음 모듈
        };
    });

    // ── 3. 통째 보관 (legacy) + 「못 옮긴」 개수 세기 ──
    const legacy: LegacyDoc = deepClone(src);

    const carried: Record<string, number> = {};
    let carriedTotal = 0;
    // src 의 모든 배열 키를 센다. tracks 는 표로 폈으니 제외, 나머지는 전부 「보관」으로 센다.
    // 🔴 모르는 배열 키도 여기서 자동으로 잡힌다 — 버리지 않고 센다.
    for (const key of arrayKeysOf(src)) {
        if (key === 'tracks') continue;
        const n = asArray(src[key]).length;
        carried[key] = n;
        carriedTotal += n;
    }
    // 한 번도 안 나온 알려진 종류도 0 으로 보여준다(화면이 「없음」을 말할 수 있게)
    for (const key of CARRIED_KEYS_HINT) if (!(key in carried)) carried[key] = 0;

    const sourceTotal = countSourceItems(src);
    const heldTotal = sheets.length + carriedTotal;

    const report: MigrationReport = {
        ok: sourceTotal === heldTotal,
        sheetCount: sheets.length,
        carried,
        carriedTotal,
        sourceTotal,
        heldTotal,
    };

    const project: Project = {
        schemaVersion: V2_SCHEMA_VERSION,
        name, term, sheets, trash: [], legacy,
    };
    return { project, report };
}

/**
 * 원본이 들고 있던 항목 총수 — 모든 배열 키의 길이 합.
 * 🔴 「표로 편 것(반)」과 「보관한 것(나머지)」을 합치면 이 값과 같아야 한다(무결성).
 */
export function countSourceItems(src: Record<string, unknown>): number {
    let n = 0;
    for (const key of arrayKeysOf(src)) n += asArray(src[key]).length;
    return n;
}

/** 열려 있는 v2 프로젝트가 「개수가 맞나」 다시 검산한다 — 저장 직전 관문 */
export function verifyProjectIntegrity(project: Project): MigrationReport | null {
    if (!project.legacy) return null; // v1 에서 온 게 아니면 검산할 것이 없다
    const src = project.legacy;
    const sourceTotal = countSourceItems(src);
    const carried: Record<string, number> = {};
    let carriedTotal = 0;
    for (const key of arrayKeysOf(src)) {
        if (key === 'tracks') continue;
        const n = asArray(src[key]).length;
        carried[key] = n;
        carriedTotal += n;
    }
    const heldTotal = project.sheets.length + project.trash.length + carriedTotal;
    return {
        ok: sourceTotal === heldTotal,
        sheetCount: project.sheets.length + project.trash.length,
        carried, carriedTotal, sourceTotal, heldTotal,
    };
}

// ── 보조 ──────────────────────────────────────────────────────

function arrayKeysOf(src: Record<string, unknown>): string[] {
    const keys: string[] = [];
    for (const k of Object.keys(src)) if (Array.isArray(src[k])) keys.push(k);
    return keys;
}

function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}

/** v1 TimetableSpec 을 값으로 복사 — 모양은 그대로, id 만 새로 받아 표가 독립 소유하게 한다 */
function copySpec(rawSpec: Record<string, unknown>): TimetableSpec {
    const clone = deepClone(rawSpec) as unknown as TimetableSpec;
    clone.id = uid('spec');
    if (!Array.isArray(clone.slots)) clone.slots = [];
    if (!Array.isArray(clone.activeDays)) clone.activeDays = [0, 1, 2, 3, 4];
    if (typeof clone.cycleDays !== 'number') clone.cycleDays = 7;
    if (typeof clone.name !== 'string') clone.name = '시간 틀';
    return clone;
}

function deepClone<T>(v: T): T {
    // 저장할 수 있는 JSON 데이터만 다룬다 — structuredClone 이 없을 수도 있어 JSON 경유
    return JSON.parse(JSON.stringify(v)) as T;
}
