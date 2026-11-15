/**
 * 특별실 고정 사용 불러오기 — 해석 규칙(운영 앱 room-import.ts 이식). 순수 함수, DB·서버 없음.
 *
 *   두 길이 같은 미리보기로 모인다.
 *     (1) 양식 — 이 앱이 내주는 표(행: 요일×시각, 열: 방)를 엑셀·CSV 로 채워 올린다.
 *     (2) 한글 문서·엑셀 — 학교가 이미 만든 특별실 시간표(hwp·hwpx·xlsx)를 그대로 올린다. 표를 찾아 읽는다.
 *   미리보기에서 방마다 「기존 방에 넣기 / 새 방 만들기 / 건너뛰기」를 고르고, 더해지고 바뀌고 지워지는 것을 본 뒤 반영한다.
 *   반영은 그 방의 「주간 고정 사용」을 파일 내용으로 통째로 바꾼다(시간표 배치는 다른 묶음이라 건드리지 않는다).
 *   시간 틀(줄 머리 → 시각)은 shared/import 의 것을 그대로 쓴다.
 */
import { readTable } from '../../../../shared/import/index.ts';
import type { TableKind } from '../../../../shared/import/index.ts';
import { fixedDuplicates } from '../../../../shared/room-rules.ts';
import { DAYS, findDayRow, gridColumns, type RowInfo } from '../../../../shared/import/grid.ts';
import type { TimeFrame } from '../../../../shared/import/frame.ts';
import type { Room, RoomFixed } from '../book';

export { DAYS };
export type { RowInfo };

export interface ImportCell { dayIndex: number; start: string; label: string }
export interface ImportRoom {
    /** 파일 안의 열 이름(머리 그대로) */
    key: string;
    /** 방 이름으로 쓸 만한 것 */
    suggestedName: string;
    /** 한 칸에 든 가장 많은 사용 수 */
    capacityHint: number;
    cells: ImportCell[];
    /** 같은 이름의 기존 방 */
    matchRoomId: string | null;
    diff: { add: number; change: number; remove: number; same: number };
}
export interface RoomPreview {
    source: TableKind;
    tables: { index: number; rows: number; cols: number; title: string; score: number }[];
    tableIndex: number;
    /** 줄 머리를 어떻게 읽었는지 */
    rows: (RowInfo & { chosen?: boolean })[];
    rooms: ImportRoom[];
    warnings: string[];
    times: { start: string; end: string; labels: string[] }[];
}
export type RoomPreviewResult = { ok: true; preview: RoomPreview } | { ok: false; reason: string; warnings: string[] };
export interface PreviewOptions { tableIndex?: number; /** 모호한 줄 머리 → 고른 시각 */ choices?: Record<string, string> }

// ─────────────────────────────────────── 작은 규칙

/** 칸 글자 정리: 주석(*…) 자르고, '5G' → '5학년' */
export function cleanLabel(v: string): string {
    return v.replace(/\*.*$/s, '').replace(/\s+/g, ' ').trim().replace(/^(\d)\s*G$/i, '$1학년');
}

/** 머리 글자에서 방 이름. 「마법약실16마법약(전담)…」 → 「마법약실1」, 「등잔밑이어둡관(전학년)」 → 「등잔밑이어둡관」 */
export function roomNameOf(header: string): string {
    const h = header.replace(/\s+/g, ' ').trim();
    const token = h.split(/[\s(]/)[0] || h;
    // 첫 낱말에서 「…실/관/장/당」 과 바로 뒤 숫자 하나까지. 띄어쓰기 없이 붙은 설명을 떼어 낸다
    const m = /^.+?(실|관|장|당)\d?/.exec(token);
    return m && m[0].length >= 2 ? m[0] : token;
}

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number): string => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
const norm = (s: string) => s.replace(/\s+/g, '');

/** 표 하나가 특별실 시간표처럼 보이는 정도. 요일 줄이 있고, 열 머리가 「N학년 N반」·「<교사>」 가 아니고, 실·관·장 같은 글자가 있으면 높다. 양식 꼴은 가장 높다 */
export function scoreTable(g: string[][]): { score: number; dayRow: number; title: string } {
    if (isTemplate(g)) return { score: 100, dayRow: 0, title: g[0].slice(3).filter(Boolean).slice(0, 4).join(' / ') };
    const dayRow = findDayRow(g);
    if (dayRow < 0) return { score: 0, dayRow, title: '' };
    const heads = dayRow > 0 ? g[dayRow - 1].slice(1).filter(Boolean) : [];
    const title = heads.slice(0, 4).join(' / ');
    if (!heads.length) return { score: 1, dayRow, title };
    if (heads.some((h) => /\d\s*학년\s*\d+\s*반/.test(h) || h.trim().startsWith('<'))) return { score: 1, dayRow, title };
    const roomish = heads.filter((h) => /(실|관|장|당|터)/.test(h)).length;
    return { score: 2 + roomish, dayRow, title };
}

const isTemplate = (g: string[][]) => !!g[0] && g[0].some((h) => h.trim() === '요일') && g[0].some((h) => h.trim() === '시각');

type ByKey = Map<string, Map<string, string[]>>;

function diffOf(cells: ImportCell[], cur: Map<string, string> | undefined) {
    const d = { add: 0, change: 0, remove: 0, same: 0 };
    const seen = new Set<string>();
    for (const c of cells) {
        const k = c.dayIndex + '|' + c.start; seen.add(k);
        const old = cur?.get(k);
        if (old == null) d.add++; else if (old === c.label) d.same++; else d.change++;
    }
    if (cur) for (const k of cur.keys()) if (!seen.has(k)) d.remove++;
    return d;
}

/** 방별 지금 고정 사용 → 「요일|시각」 → 글자 */
const currentMap = (current: RoomFixed[]): Map<string, Map<string, string>> => {
    const m = new Map<string, Map<string, string>>();
    for (const f of current) { if (!m.has(f.roomId)) m.set(f.roomId, new Map()); m.get(f.roomId)!.set(f.dayIndex + '|' + toHhmm(f.startMin), f.label); }
    return m;
};

function finishRooms(byKey: ByKey, existing: Room[], current: RoomFixed[]): ImportRoom[] {
    const cur = currentMap(current);
    const out: ImportRoom[] = [];
    for (const [key, cellMap] of byKey) {
        const cells: ImportCell[] = [];
        let cap = 1;
        for (const [k, labels] of cellMap) {
            const [di, start] = k.split('|');
            const ls = labels.map(cleanLabel).filter(Boolean);
            if (!ls.length) continue;
            cap = Math.max(cap, ls.length);
            cells.push({ dayIndex: Number(di), start, label: ls.join(' · ') });
        }
        cells.sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start));
        const suggested = roomNameOf(key);
        // 이름이 똑같을 때만 기존 방으로 잇는다. 앞부분만 같은 것(과학실 ↔ 과학실1)은 다른 방이다 — 미리보기에서 사람이 고른다
        const match = existing.find((r) => norm(r.name) === norm(suggested)) ?? existing.find((r) => norm(r.name) === norm(key));
        out.push({ key, suggestedName: match?.name ?? suggested, capacityHint: cap, cells, matchRoomId: match?.id ?? null, diff: diffOf(cells, match ? cur.get(match.id) : undefined) });
    }
    return out;
}

// ─────────────────────────────────────── 한글 문서·엑셀의 학급형 표(열 머리 = 방, 요일 줄 아래 = 교시)

/**
 * 표의 데이터 줄을 돌며 칸마다 (열, 시각, 글자). 줄 머리가 빈 줄은 위 줄에 이어 붙는다(한 칸 여러 줄).
 * 모호한 줄(교시 번호만이고 학년마다 시각이 다름)은 choices[줄 머리] 로 고른 시각을 쓰고, 없으면 건너뛰며 rows 에 options 를 남긴다.
 */
function walkGrid(g: string[][], dayRow: number, frame: TimeFrame, choices: Record<string, string> | undefined, onCell: (key: string, dayIndex: number, start: string, text: string) => void): RoomPreview['rows'] {
    const cols = gridColumns(g, dayRow);
    const rows: RoomPreview['rows'] = [];
    const seen = new Map<string, RoomPreview['rows'][number]>();
    let label = '';
    for (let r = dayRow + 1; r < g.length; r++) {
        const l = (g[r][0] ?? '').trim();
        if (l) label = l;
        if (!label) continue;
        g[r].forEach((v, c) => {
            const ci = cols[c];
            if (!ci) return;
            let ri = seen.get(label);
            if (!ri) {
                const res = frame.resolve(label, null);
                const chosen = choices?.[label];
                ri = chosen && frame.times.some((t) => t.start === chosen) ? { label, start: chosen, reason: '직접 고름', options: res.options, chosen: true } : { label, ...res };
                seen.set(label, ri); rows.push(ri);
            }
            if (!v.trim()) return;
            ri.hasContent = true;
            if (ri.start) onCell(ci.key, ci.dayIndex, ri.start, v);
        });
    }
    return rows;
}

function gridToRooms(g: string[][], dayRow: number, frame: TimeFrame, warnings: string[], choices?: Record<string, string>): { byKey: ByKey; rows: RoomPreview['rows'] } {
    const byKey: ByKey = new Map();
    for (const ci of gridColumns(g, dayRow)) if (ci && !byKey.has(ci.key)) byKey.set(ci.key, new Map());
    const rows = walkGrid(g, dayRow, frame, choices, (key, di, start, text) => {
        const m = byKey.get(key)!;
        const k = di + '|' + start;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(text);
    });
    for (const r of rows) if (!r.start && r.hasContent) warnings.push(r.options ? `「${r.label.slice(0, 30)}」 줄: ${r.reason}. 아래 「줄 해석」에서 시각을 골라 주세요` : `「${r.label.slice(0, 30)}」 줄: ${r.reason} — 건너뜁니다`);
    return { byKey, rows };
}

/** 양식 꼴: 요일·시각 열 + 방 열들 */
function templateToRooms(g: string[][], frame: TimeFrame, warnings: string[]): ByKey {
    const head = g[0].map((h) => h.trim());
    const cDay = head.indexOf('요일'), cTime = head.indexOf('시각');
    const roomCols = head.map((h, i) => ({ h, i })).filter(({ h, i }) => h && i !== cDay && i !== cTime && !h.startsWith('교시'));
    const byKey: ByKey = new Map(roomCols.map(({ h }) => [h, new Map()]));
    g.slice(1).forEach((r, n) => {
        const di = DAYS.indexOf((r[cDay] ?? '').trim().replace(/요일$/, ''));
        const start = frame.resolve((r[cTime] ?? '').trim(), null).start; // 양식의 시각 칸은 「09:00~09:40」 이라 줄 머리의 시각
        if (di < 0 || !start) { if (roomCols.some(({ i }) => (r[i] ?? '').trim())) warnings.push(`${n + 2}번째 줄: 요일이나 시각을 알 수 없어 건너뜁니다`); return; }
        for (const { h, i } of roomCols) {
            const v = (r[i] ?? '').trim();
            if (v) byKey.get(h)!.set(di + '|' + start, v.split(/\s*[\r\n]+\s*/).filter(Boolean));
        }
    });
    return byKey;
}

/** 표들(파일 하나의 표 여럿) → 미리보기. 점수가 가장 높은 표(또는 tableIndex)를 읽는다. 요일 줄이 있는 표가 없으면 ❌ */
export function previewRoomTables(frame: TimeFrame, tables: string[][][], rooms: Room[], current: RoomFixed[], source: TableKind, opts: PreviewOptions = {}): RoomPreviewResult {
    if (!tables.length) return { ok: false, reason: '표를 읽지 못했습니다', warnings: [] };
    const scored = tables.map((g, index) => ({ index, rows: g.length, cols: g[0]?.length ?? 0, ...scoreTable(g) }));
    const pick = opts.tableIndex != null && scored[opts.tableIndex] ? scored[opts.tableIndex] : [...scored].sort((a, b) => b.score - a.score || b.index - a.index)[0];
    if (pick.score === 0) return { ok: false, reason: '요일(월~금) 줄이 있는 표를 찾지 못했습니다', warnings: [] };
    const g = tables[pick.index];
    const warnings: string[] = [];
    let byKey: ByKey;
    let rows: RoomPreview['rows'] = [];
    if (isTemplate(g)) byKey = templateToRooms(g, frame, warnings);
    else ({ byKey, rows } = gridToRooms(g, pick.dayRow, frame, warnings, opts.choices));
    return {
        ok: true,
        preview: {
            source, tableIndex: pick.index,
            tables: scored.map(({ index, rows: n, cols, title, score }) => ({ index, rows: n, cols, title, score })),
            rows, rooms: finishRooms(byKey, rooms, current), warnings, times: frame.times,
        },
    };
}

/** 파일 바이트 → 미리보기. 깨진 파일·못 읽는 꼴은 던지지 않고 ❌ 이유를 돌려준다. */
export function previewRoomFile(frame: TimeFrame, bytes: Uint8Array, name: string, rooms: Room[], current: RoomFixed[], opts: PreviewOptions = {}): RoomPreviewResult {
    const first = readTable(bytes, { name });
    if (first.rows.length === 0) return { ok: false, reason: first.warnings[0] ?? '표를 읽지 못했습니다', warnings: first.warnings };
    const tables = [first.rows];
    const warnings = [...first.warnings];
    for (let i = 1; i < (first.sheets?.length ?? 0); i++) {
        const t = readTable(bytes, { name, sheet: i });
        warnings.push(...t.warnings);
        tables.push(t.rows); // 빈 표도 자리를 지켜 tableIndex 가 시트 번호와 어긋나지 않게 한다
    }
    const r = previewRoomTables(frame, tables, rooms, current, first.kind, opts);
    if (!r.ok) return { ...r, warnings: [...warnings, ...r.warnings] };
    return { ok: true, preview: { ...r.preview, warnings: [...warnings, ...r.preview.warnings] } };
}

// ─────────────────────────────────────── 양식 내려받기
const esc = (v: string) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

/** 양식: 줄은 요일 × 시각, 열은 방. 방이 없으면 방1·방2·방3 자리. blank 가 아니면 지금 고정 사용을 채워 둔다 */
export function roomTemplateCsv(frame: TimeFrame, rooms: Room[], current: RoomFixed[], blank: boolean): string {
    const cur = currentMap(current);
    const names = rooms.length ? rooms.map((r) => r.name) : ['방1', '방2', '방3'];
    const lines = [['요일', '시각', '교시(1·2 / 3·4 / 5·6학년)', ...names].map(esc).join(',')];
    for (let di = 0; di < 5; di++) for (const t of frame.times) {
        const vals = rooms.length && !blank ? rooms.map((r) => cur.get(r.id)?.get(di + '|' + t.start) ?? '') : names.map(() => '');
        lines.push([DAYS[di], t.start + '~' + t.end, t.labels.map((l) => l.replace('교시', '')).join(' · '), ...vals].map(esc).join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
}

// ─────────────────────────────────────── 반영(방·고정 목록에 입히기)
export interface ApplyItem { roomId: string | null; name: string; capacity?: number; cells: ImportCell[] }
export type ApplyResult =
    | { ok: true; next: { rooms: Room[]; fixed: RoomFixed[] }; applied: { roomId: string; name: string; created: boolean; cells: number }[] }
    | { ok: false; error: string };

/**
 * 방마다 그 방의 고정 사용을 통째로 바꾼다(없던 칸은 사라진다). roomId 가 null 이면 같은 이름의 방을 쓰고 없으면 새로 만든다.
 * 없는 방·수업 시각이 아닌 칸·정원 범위 밖이면 아무것도 바꾸지 않고 ❌. 끝에 (방,요일,시작) 겹침도 `fixedDuplicates` 로 다시 본다.
 */
export function applyRoomImport(frame: TimeFrame, rooms: Room[], fixed: RoomFixed[], items: ApplyItem[], newId: () => string): ApplyResult {
    if (!items.length) return { ok: false, error: '반영할 방이 없습니다' };
    const endOf = new Map(frame.times.map((t) => [t.start, t.end]));
    const nextRooms = rooms.map((r) => ({ ...r }));
    const replaced = new Set<string>();
    const add: RoomFixed[] = [];
    const applied: { roomId: string; name: string; created: boolean; cells: number }[] = [];
    let sort = rooms.reduce((m, r) => Math.max(m, r.sort), 0);
    for (const it of items) {
        const name = it.name.trim();
        if (!name || name.length > 30) return { ok: false, error: '방 이름은 1~30자여야 합니다' };
        let room = it.roomId != null ? nextRooms.find((r) => r.id === it.roomId) : nextRooms.find((r) => r.name === name);
        if (it.roomId != null && !room) return { ok: false, error: '없는 방입니다: ' + name };
        let created = false;
        if (!room) {
            const capacity = it.capacity ?? 1;
            if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return { ok: false, error: name + ' 정원은 1~20 이어야 합니다' };
            room = { id: newId(), name, capacity, resourceKey: null, active: true, sort: ++sort, note: '' };
            nextRooms.push(room); created = true;
        }
        if (replaced.has(room.id)) return { ok: false, error: '같은 방을 두 번 고를 수 없습니다: ' + room.name };
        replaced.add(room.id);
        const seen = new Set<string>();
        for (const c of it.cells) {
            const end = endOf.get(c.start);
            if (!Number.isInteger(c.dayIndex) || c.dayIndex < 0 || c.dayIndex > 4 || !end) return { ok: false, error: `${name} ${DAYS[c.dayIndex] ?? c.dayIndex} ${c.start} 는 수업 시각이 아닙니다` };
            const label = c.label.trim();
            if (!label || label.length > 120) return { ok: false, error: name + ' 칸 글자는 1~120자여야 합니다' };
            const k = c.dayIndex + '|' + c.start;
            if (seen.has(k)) continue;
            seen.add(k);
            add.push({ id: newId(), roomId: room.id, dayIndex: c.dayIndex, startMin: toMin(c.start), endMin: toMin(end), label });
        }
        applied.push({ roomId: room.id, name: room.name, created, cells: seen.size });
    }
    const nextFixed = [...fixed.filter((f) => !replaced.has(f.roomId)), ...add];
    if (fixedDuplicates(nextFixed).length > 0) return { ok: false, error: '같은 방·요일·시작의 고정 사용이 겹칩니다' };
    return { ok: true, next: { rooms: nextRooms, fixed: nextFixed }, applied };
}
