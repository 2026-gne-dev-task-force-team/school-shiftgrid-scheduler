/**
 * 시수표의 「덜 채운 줄」 보관 (T-10cp · R108 ③④).
 *
 *  🔴 덜 채운 줄은 문서(Doc) 밖에 둔다 — 내보내기·자동 보관본이 문서 통째를 쓰기 때문이다(platform/index.ts).
 *     앱 상태 + 브라우저 저장소의 따로 된 열쇠 `shiftgrid.demandDrafts` 에만 둔다.
 *  · 저장값에 학교 이름 표시(school)를 붙인다. 다른 학교 문서를 보고 있으면 보이지 않고, 학교를 바꾸면 비운다.
 *  · 시수표를 다시 띄울 때(탭 오가기)·되돌리기로 줄을 다시 접을 때 이 줄들을 뒤에 다시 붙인다.
 */
import type { Doc } from '../types/doc';
import type { Agent } from '../types/schema';
import type { SheetRow } from '../ui/parts/Sheet';
import { unfold } from './demand-sheet';

export const DRAFTS_KEY = 'shiftgrid.demandDrafts';

export interface DraftStore {
    /** 이 줄들을 쓴 학교 이름(Doc.meta.name) */
    school: string;
    rows: SheetRow[];
}

/** 자동 배정 전에 알리는 글 — 덜 채운 줄은 배정에서 빠진다. 막지는 않는다(R131 ①) */
export function draftNotice(n: number): string {
    return n > 0 ? `덜 채운 줄 ${n}개는 빼고 배정합니다` : '';
}

export const EMPTY_DRAFTS: DraftStore = { school: '', rows: [] };

/** 저장소 흉내 — 시험에서 바꿔 끼운다 */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStorage(): KeyValueStorage | undefined {
    try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

export function loadDrafts(storage: KeyValueStorage | undefined = defaultStorage()): DraftStore {
    try {
        const s = storage?.getItem(DRAFTS_KEY);
        if (!s) return EMPTY_DRAFTS;
        const v = JSON.parse(s) as Partial<DraftStore>;
        if (typeof v?.school !== 'string' || !Array.isArray(v.rows)) return EMPTY_DRAFTS;
        return { school: v.school, rows: v.rows.filter((r): r is SheetRow => !!r && typeof r === 'object' && typeof (r as SheetRow)._id === 'string') };
    } catch { return EMPTY_DRAFTS; }
}

export function saveDrafts(d: DraftStore, storage: KeyValueStorage | undefined = defaultStorage()): void {
    try { storage?.setItem(DRAFTS_KEY, JSON.stringify(d)); } catch { /* 조용히 */ }
}

/** 지금 학교의 덜 채운 줄 — 학교 표시가 다르면 빈 목록 */
export function draftsFor(d: DraftStore, school: string): SheetRow[] {
    return d.school === school ? d.rows : [];
}

/** 학교가 바뀌었으면 비운 보관을, 같으면 그대로 돌려준다 */
export function draftsOnSchoolChange(d: DraftStore, school: string): DraftStore {
    return d.school === school ? d : { school, rows: [] };
}

/** 아무것도 안 고른 줄(행 추가 직후 그대로) — 보관하지 않는다 */
export function isBlankRow(r: SheetRow): boolean {
    const s = (v: unknown) => String(v ?? '').trim();
    const cls = Array.isArray(r.반) ? r.반.length : s(r.반).length;
    return !s(r.교사) && !s(r.함께수업) && !s(r.과목) && !s(r.학년) && cls === 0;
}

/** 시트 행 중 문서에 들어가지 못하는(펼쳐도 시수가 0줄인) 줄 = 덜 채운 줄. 빈 줄은 뺀다 */
export function pickDrafts(doc: Doc, rows: SheetRow[]): SheetRow[] {
    return rows.filter((r) => !isBlankRow(r) && unfold(doc, [r]).demands.length === 0);
}

/** 접은 줄 뒤에 덜 채운 줄을 다시 붙인다(같은 _id 는 한 번만) */
export function withDrafts(folded: SheetRow[], drafts: SheetRow[]): SheetRow[] {
    if (drafts.length === 0) return folded;
    const ids = new Set(folded.map((r) => r._id));
    return [...folded, ...drafts.filter((r) => !ids.has(r._id))];
}

/**
 * 「수업이 없는 교사」 — 시수표 어느 줄에도(교사·함께 수업) 없는 사람.
 *  · 역할 '비교과'(전담·강사 탭의 강사·보건·영양 등)는 원래 수업이 없을 수 있어 뺀다 — 늘 켜진 경고등이 되지 않게.
 *    (끄려고 사람을 지우면 운영 앱 보결의 비교과 후보가 빈다)
 *  · 덜 채운 줄에 이미 이름이 오른 사람도 뺀다(채우는 중).
 */
export function agentsWithoutClasses(doc: Doc, drafts: SheetRow[] = []): Agent[] {
    const used = new Set<string>();
    for (const dm of doc.demands) { used.add(dm.agentId); if (dm.coAgentId) used.add(dm.coAgentId); }
    const draftNames = new Set(drafts.flatMap((r) => [String(r.교사 ?? '').trim(), String(r.함께수업 ?? '').trim()]).filter(Boolean));
    return doc.agents.filter((a) => a.role !== '비교과' && !used.has(a.id) && !draftNames.has(a.name));
}
