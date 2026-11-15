/**
 * 학급 시간표(담임 과목) 불러오기 — 해석 규칙(운영 앱 class-import.ts 이식). 순수 함수, DB·서버 없음.
 *
 *   편성 앱은 전담 수업만 짠다. 담임 칸 과목은 담임이 따로 짜서 학교가 취합한다. 그 취합본(hwp·hwpx 학급 표 · xlsx · CSV 양식)을
 *   `shared/import` 가 같은 행 꼴로 읽어 주면, 여기서 반·요일·시각마다 과목으로 풀어 낸다.
 *   대조: 전담 칸은 편성 결과가 기준 — 취합본의 그 칸 과목이 다르면 어긋남으로 보여 주고 저장하지 않는다.
 *   점심·수업 없는 칸에 글자가 있으면 이유와 함께 건너뛴다.
 */
import { readTable } from '../../../../shared/import/index.ts';
import type { TableKind } from '../../../../shared/import/index.ts';
import type { TimeFrame } from './frame';

export const DAYS = ['월', '화', '수', '목', '금'];
const SKIP = new Set(['', '점심', '—', '-', '–', '하교']);

/** 저장되는 담임 칸 과목 한 칸 */
export interface ClassSubject { trackName: string; dayIndex: number; start: string; subject: string }
export interface ClassCell { dayIndex: number; start: string; subject: string }
export interface RowInfo { label: string; owner?: string; start: string | null; reason: string; options?: { start: string; grades: number[] }[]; hasContent?: boolean }
export interface ClassPreviewItem {
    trackName: string;
    homeroomName: string | null;
    /** 담임 칸만(저장할 것) */
    cells: ClassCell[];
    /** 대조한 전담 칸 수 */
    checked: number;
    mismatches: { dayIndex: number; start: string; file: string; timetable: string }[];
    skipped: { dayIndex: number; start: string; text: string; why: string }[];
    diff: { add: number; change: number; remove: number; same: number };
}
export interface ClassPreview {
    source: TableKind;
    tables: { index: number; title: string; classes: number }[];
    rows: RowInfo[];
    classes: ClassPreviewItem[];
    /** 시간표에 없는 반 이름 */
    unknown: string[];
    warnings: string[];
    times: { start: string; end: string; labels: string[] }[];
}
export type ClassPreviewResult = { ok: true; preview: ClassPreview } | { ok: false; reason: string; warnings: string[] };

/** 열 머리 → 반 이름. 「3학년 2반」·「3학년2반」·「3-2」 */
export function classNameOf(header: string): string | null {
    const h = header.replace(/\s+/g, '');
    let m = /^(\d+)학년(\d+)반/.exec(h);
    if (m) return m[1] + '-' + m[2];
    m = /^(\d+)-(\d+)$/.exec(h);
    return m ? m[1] + '-' + m[2] : null;
}

/** 칸 글자 → 과목. 「과학(전담)」 표시와 공백 정리 */
export function subjectOf(text: string): string {
    return text.replace(/\(\s*전담\s*\)/g, '').replace(/\s+/g, ' ').trim();
}

type Raw = Map<string, Map<string, string>>;
type CurrentMap = Map<string, Map<string, string>>;

const currentMap = (current: ClassSubject[]): CurrentMap => {
    const m: CurrentMap = new Map();
    for (const x of current) { if (!m.has(x.trackName)) m.set(x.trackName, new Map()); m.get(x.trackName)!.set(x.dayIndex + '|' + x.start, x.subject); }
    return m;
};

/** (반, 요일, 시각, 글자) 묶음 → 반별 미리보기 */
function buildPreview(frame: TimeFrame, raw: Raw, current: CurrentMap): ClassPreviewItem[] {
    const out: ClassPreviewItem[] = [];
    for (const [trackName, byCell] of raw) {
        const t = frame.track(trackName)!;
        const item: ClassPreviewItem = { trackName, homeroomName: t.homeroomName ?? null, cells: [], checked: 0, mismatches: [], skipped: [], diff: { add: 0, change: 0, remove: 0, same: 0 } };
        for (const [k, text] of byCell) {
            const [diS, start] = k.split('|');
            const di = Number(diS);
            const subject = subjectOf(text);
            if (SKIP.has(subject)) continue;
            const lesson = frame.lessonsOf(trackName, di).find((l) => l.start === start);
            if (!lesson) { item.skipped.push({ dayIndex: di, start, text: subject, why: frame.lunchOf(trackName) === start ? '그 반 점심 시간' : '그날 그 반 수업 칸이 아님' }); continue; }
            if (lesson.specialist) {
                item.checked++;
                if (lesson.subject && lesson.subject !== subject) item.mismatches.push({ dayIndex: di, start, file: subject, timetable: lesson.subject });
                continue;
            }
            item.cells.push({ dayIndex: di, start, subject });
        }
        item.cells.sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start));
        const cur = current.get(trackName);
        const seen = new Set<string>();
        for (const c of item.cells) {
            const k = c.dayIndex + '|' + c.start; seen.add(k);
            const old = cur?.get(k);
            if (old == null) item.diff.add++; else if (old === c.subject) item.diff.same++; else item.diff.change++;
        }
        if (cur) for (const k of cur.keys()) if (!seen.has(k)) item.diff.remove++;
        out.push(item);
    }
    return out.sort((a, b) => { const [ag, ac] = a.trackName.split('-').map(Number), [bg, bc] = b.trackName.split('-').map(Number); return ag - bg || ac - bc; });
}

// ─────────────────────────────────────── 표 모양 둘: 학급 표(한글 원본 꼴) · 양식(요일×시각 줄, 반 열)

/** 요일 줄(월~금이 다섯 번 이상 나오는 첫 줄, 위쪽 4줄 안) */
export function findDayRow(g: string[][]): number {
    for (let r = 0; r < Math.min(4, g.length); r++) if (g[r].filter((x) => DAYS.includes(x.trim())).length >= 5) return r;
    return -1;
}

/** 열마다 (주인 머리 글자, 요일). 주인 머리는 요일 줄 바로 위 줄에서 왼쪽으로 가장 가까운 글자(병합 칸) */
export function gridColumns(g: string[][], dayRow: number): ({ key: string; dayIndex: number } | null)[] {
    const head = dayRow > 0 ? g[dayRow - 1] : [];
    return g[dayRow].map((v, c) => {
        const di = DAYS.indexOf(v.trim());
        if (c === 0 || di < 0) return null;
        let key = '';
        for (let k = c; k >= 1; k--) if (head[k]?.trim()) { key = head[k].trim(); break; }
        return { key: key || '열' + Math.ceil(c / 5), dayIndex: di };
    });
}

/** 데이터 줄을 돌며 칸마다 (열, 시각, 글자). 줄 머리가 빈 줄은 위 줄에 이어 붙는다(한 칸 여러 줄) */
function walkGrid(g: string[][], dayRow: number, frame: TimeFrame, ownerOf: (key: string) => string | null, onCell: (key: string, dayIndex: number, start: string, text: string) => void): RowInfo[] {
    const cols = gridColumns(g, dayRow);
    const rows: RowInfo[] = [];
    const seen = new Map<string, RowInfo>();
    let label = '';
    for (let r = dayRow + 1; r < g.length; r++) {
        const l = (g[r][0] ?? '').trim();
        if (l) label = l;
        if (!label) continue;
        g[r].forEach((v, c) => {
            const ci = cols[c];
            if (!ci) return;
            const owner = ownerOf(ci.key);
            const k = label + '|' + (owner ?? '');
            let ri = seen.get(k);
            if (!ri) { ri = { label, owner: owner ?? undefined, ...frame.resolve(label, owner) }; seen.set(k, ri); rows.push(ri); }
            if (!v.trim()) return;
            ri.hasContent = true;
            if (!ri.start) return;
            onCell(ci.key, ci.dayIndex, ri.start, v);
        });
    }
    return rows;
}

const addRaw = (raw: Raw, name: string, key: string, text: string, join: boolean) => {
    if (!raw.has(name)) raw.set(name, new Map());
    const prev = raw.get(name)!.get(key);
    raw.get(name)!.set(key, join && prev ? prev + ' ' + text : text);
};

const isTemplate = (g: string[][]) => !!g[0] && g[0].some((h) => h.trim() === '요일') && g[0].some((h) => h.trim() === '시각');

/**
 * 표들(파일 하나의 표 여럿) → 미리보기. 표마다 양식 꼴인지 학급 표 꼴인지 스스로 알아본다.
 * 학급 표도 양식도 아닌 표(전담·특별실 표 등)는 조용히 넘기고, 쓸 표가 하나도 없으면 ❌.
 */
export function previewClassTables(frame: TimeFrame, tables: string[][][], current: ClassSubject[], source: TableKind): ClassPreviewResult {
    const raw: Raw = new Map();
    const unknown = new Set<string>();
    const used: ClassPreview['tables'] = [];
    const allRows: RowInfo[] = [];
    const warnings: string[] = [];
    const note = (name: string) => { if (!frame.track(name)) { unknown.add(name); return false; } return true; };
    tables.forEach((g, index) => {
        if (isTemplate(g)) {
            const head = g[0].map((h) => h.trim());
            const cDay = head.indexOf('요일'), cTime = head.indexOf('시각');
            const cols = head.map((h, i) => ({ name: classNameOf(h), i })).filter((c): c is { name: string; i: number } => !!c.name);
            if (!cols.length) return;
            used.push({ index, title: cols.slice(0, 3).map((c) => c.name).join(', ') + (cols.length > 3 ? ' …' : ''), classes: cols.length });
            g.slice(1).forEach((r, n) => {
                const di = DAYS.indexOf((r[cDay] ?? '').trim().replace(/요일$/, ''));
                const start = frame.resolve((r[cTime] ?? '').trim(), null).start;
                if (di < 0 || !start) { if (cols.some(({ i }) => !SKIP.has(subjectOf(r[i] ?? '')))) warnings.push(`${n + 2}번째 줄: 요일이나 시각을 알 수 없어 건너뜁니다`); return; }
                for (const { name, i } of cols) {
                    const v = (r[i] ?? '').trim();
                    if (!v || !note(name)) continue;
                    addRaw(raw, name, di + '|' + start, v.replace(/\s*[\r\n]+\s*/g, ' '), false);
                }
            });
            return;
        }
        const dayRow = findDayRow(g);
        if (dayRow < 0) return;
        const cols = gridColumns(g, dayRow).filter((c): c is { key: string; dayIndex: number } => !!c);
        const classes = [...new Set(cols.map((c) => classNameOf(c.key)).filter((x): x is string => !!x))];
        if (classes.length === 0) return; // 학급 표가 아니다(전담·특별실 표)
        used.push({ index, title: classes.slice(0, 3).join(', ') + (classes.length > 3 ? ' …' : ''), classes: classes.length });
        const rows = walkGrid(g, dayRow, frame,
            (key) => { const n = classNameOf(key); return n && frame.track(n) ? n : null; },
            (key, di, start, text) => { const n = classNameOf(key); if (n && note(n)) addRaw(raw, n, di + '|' + start, text, true); });
        for (const r of rows) if (r.owner) allRows.push(r);
    });
    if (!used.length) return { ok: false, reason: '「N학년 N반」 열이 있는 학급 시간표 표를 찾지 못했습니다', warnings: [] };
    // 비어 있는 줄은 조용히 넘기고, 글자가 있는데 시각을 못 정한 줄만 알린다
    for (const r of allRows) if (!r.start && r.hasContent) warnings.push(`${r.owner} 「${r.label}」 줄: ${r.reason}`);
    // 줄 해석 요약: 학년 × 줄 머리 하나씩
    const summary = new Map<string, RowInfo>();
    for (const r of allRows) { if (!r.start && !r.hasContent) continue; const g = frame.track(r.owner!)?.grade ?? 0; const k = g + '|' + r.label; if (!summary.has(k)) summary.set(k, { ...r, owner: g + '학년' }); }
    return {
        ok: true,
        preview: { source, tables: used, rows: [...summary.values()], classes: buildPreview(frame, raw, currentMap(current)), unknown: [...unknown], warnings: [...new Set(warnings)].slice(0, 30), times: frame.times },
    };
}

/** 파일 바이트 → 미리보기. 깨진 파일·못 읽는 꼴은 던지지 않고 ❌ 이유를 돌려준다. */
export function previewClassFile(frame: TimeFrame, bytes: Uint8Array, name: string, current: ClassSubject[]): ClassPreviewResult {
    const first = readTable(bytes, { name });
    if (first.rows.length === 0) return { ok: false, reason: first.warnings[0] ?? '표를 읽지 못했습니다', warnings: first.warnings };
    const tables = [first.rows];
    const warnings = [...first.warnings];
    for (let i = 1; i < (first.sheets?.length ?? 0); i++) {
        const t = readTable(bytes, { name, sheet: i });
        warnings.push(...t.warnings);
        if (t.rows.length) tables.push(t.rows);
    }
    const r = previewClassTables(frame, tables, current, first.kind);
    if (!r.ok) return { ...r, warnings: [...warnings, ...r.warnings] };
    return { ok: true, preview: { ...r.preview, warnings: [...warnings, ...r.preview.warnings] } };
}

// ─────────────────────────────────────── 엑셀·CSV 양식
const esc = (v: string) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/**
 * 양식: 줄은 요일 × 시각(전체 학년의 수업 시각), 열은 반. 점심 칸은 「점심」, 수업 없는 칸은 「—」, 전담 칸은 「과목(전담)」으로 미리 채운다.
 * 담임 칸만 비어 있다(지금 저장된 과목이 있으면 채워 둔다 — blank 면 비움).
 */
export function classTemplateCsv(frame: TimeFrame, current: ClassSubject[], blank: boolean): string {
    const cur = blank ? new Map() as CurrentMap : currentMap(current);
    const classes = frame.tracks.map((t) => t.name);
    const lines = [['요일', '시각', '교시(1·2 / 3·4 / 5·6학년)', ...classes].map(esc).join(',')];
    for (let di = 0; di < 5; di++) for (const t of frame.times) {
        const vals = classes.map((c) => {
            const lesson = frame.lessonsOf(c, di).find((l) => l.start === t.start);
            if (!lesson) return frame.lunchOf(c) === t.start ? '점심' : '—';
            if (lesson.specialist) return (lesson.subject ?? '') + '(전담)';
            return cur.get(c)?.get(di + '|' + t.start) ?? '';
        });
        lines.push([DAYS[di], t.start + '~' + t.end, t.labels.map((l) => l.replace('교시', '')).join(' · '), ...vals].map(esc).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
}

// ─────────────────────────────────────── 반영(저장 목록에 입히기)
export type ApplyResult = { ok: true; next: ClassSubject[]; applied: { trackName: string; cells: number }[] } | { ok: false; error: string };

/** 반마다 지금 저장분을 통째로 바꾼다(없던 칸은 사라진다). 모르는 반·잘못된 칸이면 아무것도 바꾸지 않고 ❌. */
export function applyClassImport(frame: TimeFrame, current: ClassSubject[], classes: { trackName: string; cells: ClassCell[] }[]): ApplyResult {
    if (!classes.length) return { ok: false, error: '반영할 반이 없습니다' };
    for (const c of classes) {
        if (!frame.track(c.trackName)) return { ok: false, error: '시간표에 없는 반입니다: ' + c.trackName };
        for (const x of c.cells) {
            if (!Number.isInteger(x.dayIndex) || x.dayIndex < 0 || x.dayIndex > 4) return { ok: false, error: c.trackName + ' 요일이 맞지 않습니다' };
            if (!/^\d{2}:\d{2}$/.test(x.start)) return { ok: false, error: c.trackName + ' 시각 꼴이 맞지 않습니다' };
            const s = x.subject.trim();
            if (!s || s.length > 40) return { ok: false, error: c.trackName + ' 과목은 1~40자여야 합니다' };
        }
    }
    const names = new Set(classes.map((c) => c.trackName));
    const next = current.filter((x) => !names.has(x.trackName));
    const applied: { trackName: string; cells: number }[] = [];
    for (const c of classes) {
        const seen = new Set<string>();
        for (const x of c.cells) {
            const k = x.dayIndex + '|' + x.start;
            if (seen.has(k)) continue;
            seen.add(k);
            next.push({ trackName: c.trackName, dayIndex: x.dayIndex, start: x.start, subject: x.subject.trim() });
        }
        applied.push({ trackName: c.trackName, cells: seen.size });
    }
    return { ok: true, next, applied };
}
