/**
 * 저장·열기·자동 보관 — v1 의 Platform 경계를 그대로 재사용한다(새 플랫폼을 만들지 않는다).
 *
 * 🔴 설계와 다르게 한 것(보고에 적음): v1 Platform 의 openDoc/saveDoc/autosave/loadAutosave 는
 *    모두 v1 `Doc` 타입에 묶여 있고 web 구현이 **migrateDoc 을 강제**해 v2 의 sheets·legacy 를 떨군다.
 *    그래서 v2 파일 왕복에는 쓸 수 없다. 대신 **같은 경계의 importFile/exportFile**(원시 바이트, migrateDoc 없음)을
 *    재사용한다 — 새 플랫폼을 만들지 않고, v1 migrateDoc 도 부르지 않는다.
 *    자동 보관만은 조용한 영속 수단이 경계에 autosave(Doc) 뿐이라, v2 전용 localStorage 키로 따로 둔다.
 */
import type { Project } from './model';
import { V2_SCHEMA_VERSION } from './model';
import type { MigrationReport } from './migrate';
import { migrateV1ToV2 } from './migrate';
import { platform } from '../platform';

const AUTOSAVE_KEY = 'shiftgrid.v2.autosave';
const EXT = '.shiftgrid.json';

export interface OpenedProject {
    project: Project;
    /** v1 에서 왔으면 변환 리포트(개수·못 옮긴 것). v2 파일이면 null */
    report: MigrationReport | null;
    fileName: string;
}

/**
 * 파일 글자 → 프로젝트. v2(schemaVersion 4) 면 그대로, 아니면 v1 로 보고 변환한다.
 * ⚠️ 순수 함수 — 테스트가 이걸 직접 검산한다.
 */
export function parseProjectFile(text: string): { project: Project; report: MigrationReport | null } {
    const raw = JSON.parse(text) as unknown;
    if (raw && typeof raw === 'object' && (raw as { schemaVersion?: unknown }).schemaVersion === V2_SCHEMA_VERSION) {
        return { project: normalizeV2(raw as Record<string, unknown>), report: null };
    }
    return migrateV1ToV2(raw);
}

/** v2 파일을 안전하게 받아들인다 — 없는 배열은 빈 배열로(모양만 맞춘다. legacy 는 보존) */
function normalizeV2(raw: Record<string, unknown>): Project {
    return {
        schemaVersion: V2_SCHEMA_VERSION,
        name: typeof raw.name === 'string' ? raw.name : '',
        term: typeof raw.term === 'string' ? raw.term : '',
        sheets: Array.isArray(raw.sheets) ? (raw.sheets as Project['sheets']) : [],
        trash: Array.isArray(raw.trash) ? (raw.trash as Project['trash']) : [],
        legacy: (raw.legacy && typeof raw.legacy === 'object') ? (raw.legacy as Project['legacy']) : null,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    };
}

export function serializeProject(project: Project): string {
    return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 1);
}

/** 파일 열기 — 경계의 importFile(원시 바이트) 재사용. 취소하면 null */
export async function openProject(): Promise<OpenedProject | null> {
    const picked = await platform.importFile('.json,application/json');
    if (!picked) return null;
    const text = new TextDecoder().decode(picked.bytes);
    const { project, report } = parseProjectFile(text);
    return { project, report, fileName: picked.name };
}

/**
 * 저장 — 항상 「다른 이름으로」(경계의 exportFile).
 * 🔴 v1 원본을 절대 덮어쓰지 않는다 — exportFile 은 내보내기(새 파일)라 원본과 자리가 다르다.
 */
export async function saveProjectAs(project: Project): Promise<string> {
    const base = project.name && project.name.trim() ? project.name.trim() : '시간표';
    const name = `${base}${EXT}`;
    await platform.exportFile(name, serializeProject(project), 'application/json');
    return name;
}

// ── 자동 보관 (v2 전용 키) ──
export function autosaveProject(project: Project): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
    } catch { /* 조용히 */ }
}

export function loadAutosaveProject(): Project | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const s = localStorage.getItem(AUTOSAVE_KEY);
        if (!s) return null;
        return parseProjectFile(s).project;
    } catch { return null; }
}

export function clearAutosave(): void {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(AUTOSAVE_KEY); } catch { /* 조용히 */ }
}
