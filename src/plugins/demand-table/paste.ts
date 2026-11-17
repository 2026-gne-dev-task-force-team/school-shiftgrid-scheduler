/**
 * 엑셀에서 복사한 표 붙여 넣기 해석(1.2v 편성기 분해 F3b) — v1 `excel.ts` 의 시수표 시트 해석(열 맞추기·이름 찾기·못 찾은 것 보고)을 시수표 꼴로.
 *   🔴 순수 함수 — 글자 + 정본(Canon, 읽기만) → 계획. 저장은 applyPaste 가 수요 줄(id 참조 셋 + 시수)로만 한다.
 *   🔴 정본(교직원·학교 반·과목)에 없는 이름은 **만들지 않는다** — 그 줄은 건너뛰고 「정본에 없음」 으로 보고만 한다(v1 의 ensureAgent·새 반·새 과목 자동 생성은 버림).
 *   ⛔ v1 의 함께 수업·특별실·연속 수업·진도 맞춤 열은 읽지 않는다(선택 열 = F4) — 「읽지 않은 열」 로 알리기만.
 */
import { parseClipboard } from '../../pane-ui-system/clipboard-tsv';
import type { CollectionKit } from '../collection/contracts/collection';
import type { Canon } from './resolve';

export type Slot = 'teacher' | 'klass' | 'subject' | 'hours' | 'grade';

const HEADER_ALIASES: Record<Slot, string[]> = {
    teacher: ['교사', '선생님', '교사명', '이름'],
    klass: ['반', '학급'],
    subject: ['과목', '교과'],
    hours: ['시수', '주당시수', '주당', '반당시수'],
    grade: ['학년'],
};
const compact = (s: string): string => s.replace(/\s+/g, '');
const aliasToSlot = new Map<string, Slot>();
for (const [slot, names] of Object.entries(HEADER_ALIASES) as [Slot, string[]][]) for (const n of names) aliasToSlot.set(n, slot);

/** 기본 열 순서(머리글이 없을 때) = 시수표 기본 넷 열 순서. */
const DEFAULT_ORDER: Slot[] = ['teacher', 'klass', 'subject', 'hours'];

export type MissReason = 'none' | 'ambiguous';
export interface Miss { name: string; rows: number; reason: MissReason }
export interface NewDemand { teacherId: string; classId: string; subjectId: string; hours: number }

export interface PasteResult {
    /** 만들 수요 줄 — 이름이 다 정본 id 로 풀린 줄만 */
    rows: NewDemand[];
    /** 정본에서 못 찾은(또는 같은 이름이 둘 이상인) 이름 — 칸별 */
    missing: { teacher: Miss[]; klass: Miss[]; subject: Miss[] };
    /** 이름이 정본에 없어 건너뛴 줄 수(= 「정본에 없음 n건」) */
    notInCanon: number;
    /** 칸 값이 이상해 건너뛴 줄(시수·빈 칸 등) — line 은 붙인 표의 줄 번호(1부터, 머리글 포함) */
    bad: { line: number; why: string }[];
    /** 읽지 않은 열 머리글(함께 수업·특별실… 선택 열은 F4) */
    ignoredColumns: string[];
    /** 머리글 줄을 찾았나 */
    hadHeader: boolean;
}

export interface PasteOptions {
    /** 반이 여러 학년도에 있으면 이 학년도 것만 본다(없으면 전부 — 같은 이름이 겹치면 「겹침」으로 보고) */
    yearId?: string;
}

/** 「3학년 2반」·「3-2」·「3 - 2」 → 「3-2」. 숫자 둘이 아니면 공백만 뺀 원문. */
export function normClass(s: string): string {
    const t = compact(s);
    const m = /^(\d+)\D+(\d+)\D*$/.exec(t);
    return m ? `${Number(m[1])}-${Number(m[2])}` : t;
}

type Index = Map<string, string[]>;
const addTo = (ix: Index, key: string, id: string) => {
    const a = ix.get(key);
    if (!a) ix.set(key, [id]);
    else if (!a.includes(id)) a.push(id);
};

function indexes(canon: Canon, opt: PasteOptions) {
    const teachers: Index = new Map();
    for (const l of canon.staff?.lists() ?? []) for (const m of canon.staff!.staffIn(l.id)) addTo(teachers, compact(m.name), m.id);
    const subjects: Index = new Map();
    for (const l of canon.subjects?.lists() ?? []) for (const s of canon.subjects!.subjectsIn(l.id)) addTo(subjects, compact(s.name), s.id);
    const classes: Index = new Map();
    const byGrade = new Map<number, string[]>();
    for (const y of canon.school?.years() ?? []) {
        if (opt.yearId && y.id !== opt.yearId) continue;
        for (const c of canon.school!.classesIn(y.id)) {
            const nn = normClass(c.name);
            addTo(classes, nn, c.id);
            if (c.grade !== undefined && c.no !== undefined) addTo(classes, `${c.grade}-${c.no}`, c.id);
            const m = /^(\d+)-/.exec(nn);
            const g = c.grade ?? (m ? Number(m[1]) : undefined);
            if (g !== undefined) byGrade.set(g, [...(byGrade.get(g) ?? []), c.id]);
        }
    }
    return { teachers, subjects, classes, byGrade };
}

const toNum = (s: string): number | undefined => {
    const t = s.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
};

/** 머리글 줄 판정 — 알려진 머리글이 둘 이상이면 머리글. 열 → 칸 지도 + 읽지 않은 열. */
function readHeader(line: readonly string[]): { map: (Slot | null)[]; ignored: string[] } | null {
    const raw = line.map((c) => aliasToSlot.get(compact(c)) ?? null);
    if (raw.filter((x) => x !== null).length < 2) return null;
    // 같은 칸이 둘이면 앞의 것만 쓴다.
    const seen = new Set<Slot>();
    const map = raw.map((s) => { if (s === null || seen.has(s)) return null; seen.add(s); return s; });
    const ignored = line.map((c, i) => (map[i] === null ? c.trim() : '')).filter((c) => c !== '');
    return { map, ignored };
}

/** 붙인 글자 → 수요 줄 계획. 정본은 읽기만 한다. */
export function parseDemandPaste(text: string, canon: Canon, opt: PasteOptions = {}): PasteResult {
    const matrix = parseClipboard(text).filter((l) => !l.every((c) => c.trim() === ''));
    const res: PasteResult = { rows: [], missing: { teacher: [], klass: [], subject: [] }, notInCanon: 0, bad: [], ignoredColumns: [], hadHeader: false };
    if (matrix.length === 0) return res;

    let map: (Slot | null)[] = DEFAULT_ORDER;
    let start = 0;
    const h = readHeader(matrix[0]);
    if (h) { map = h.map; start = 1; res.hadHeader = true; res.ignoredColumns = h.ignored; }
    const cT = map.indexOf('teacher'), cK = map.indexOf('klass'), cS = map.indexOf('subject'), cH = map.indexOf('hours'), cG = map.indexOf('grade');
    if (cT < 0 || cK < 0 || cS < 0 || cH < 0) {
        const lack = ([['교사', cT], ['반', cK], ['과목', cS], ['시수', cH]] as const).filter(([, c]) => c < 0).map(([n]) => n);
        res.bad.push({ line: 1, why: `머리글에 ${lack.join('·')} 열이 없습니다` });
        return res;
    }

    const ix = indexes(canon, opt);
    const missAcc = { teacher: new Map<string, Miss>(), klass: new Map<string, Miss>(), subject: new Map<string, Miss>() };
    const miss = (kind: keyof typeof missAcc, name: string, reason: MissReason) => {
        const k = `${reason}|${name}`;
        const m = missAcc[kind].get(k);
        if (m) m.rows += 1; else missAcc[kind].set(k, { name, rows: 1, reason });
    };
    const lookup = (kind: keyof typeof missAcc, index: Index, key: string, shown: string): string | null => {
        const ids = index.get(key);
        if (!ids) { miss(kind, shown, 'none'); return null; }
        if (ids.length > 1) { miss(kind, shown, 'ambiguous'); return null; }
        return ids[0];
    };
    const cell = (line: readonly string[], c: number) => (line[c] ?? '').trim();

    matrix.slice(start).forEach((line, i) => {
        const lineNo = i + start + 1;
        const tName = cell(line, cT), kName = cell(line, cK), sName = cell(line, cS), hText = cell(line, cH), gText = cG >= 0 ? cell(line, cG) : '';
        if (!tName) { res.bad.push({ line: lineNo, why: '교사 칸이 비었습니다' }); return; }
        if (!sName) { res.bad.push({ line: lineNo, why: '과목 칸이 비었습니다' }); return; }
        if (!kName) { res.bad.push({ line: lineNo, why: '반 칸이 비었습니다' }); return; }
        const hours = toNum(hText);
        if (hours === undefined || hours <= 0) { res.bad.push({ line: lineNo, why: `시수 값이 이상합니다('${hText}')` }); return; }

        // 반 — 학년 열이 있으면 「1,2,3」·「전체」(v1 양식)도 읽는다.
        const resolvedClasses: (string | null)[] = [];
        if (gText !== '') {
            const g = toNum(gText);
            if (g === undefined) { res.bad.push({ line: lineNo, why: `학년 값이 이상합니다('${gText}')` }); return; }
            if (compact(kName) === '전체') {
                const all = ix.byGrade.get(g) ?? [];
                if (all.length === 0) { miss('klass', `${g}학년 전체`, 'none'); resolvedClasses.push(null); }
                else resolvedClasses.push(...all);
            } else {
                for (const n of kName.split(',').map((x) => x.trim()).filter((x) => x !== '')) resolvedClasses.push(lookup('klass', ix.classes, normClass(`${g}-${n}`), `${g}-${n}`));
            }
        } else {
            resolvedClasses.push(lookup('klass', ix.classes, normClass(kName), kName));
        }

        const teacherId = lookup('teacher', ix.teachers, compact(tName), tName);
        const subjectId = lookup('subject', ix.subjects, compact(sName), sName);
        if (!teacherId || !subjectId || resolvedClasses.length === 0 || resolvedClasses.some((c) => c === null)) { res.notInCanon += 1; return; }
        for (const classId of resolvedClasses as string[]) res.rows.push({ teacherId, classId, subjectId, hours });
    });

    const byRows = (a: Miss, b: Miss) => b.rows - a.rows || a.name.localeCompare(b.name);
    res.missing = { teacher: [...missAcc.teacher.values()].sort(byRows), klass: [...missAcc.klass.values()].sort(byRows), subject: [...missAcc.subject.values()].sort(byRows) };
    return res;
}

/** 계획 → 시수표에 수요 줄 더하기. 🔴 이름은 안 넣는다(제목 칸 = 빈 메모) · 만든 id 들. */
export function applyPaste(kit: CollectionKit, listId: string, rows: readonly NewDemand[]): string[] {
    const ids: string[] = [];
    for (const r of rows) {
        const id = kit.addItem(listId, { name: '', f_teacher: [r.teacherId], f_class: [r.classId], f_subject: [r.subjectId], f_hours: r.hours } as never);
        if (id) ids.push(id);
    }
    return ids;
}

/** 쥔님께 보이는 요약 줄들. */
export function pasteSummary(r: PasteResult): string[] {
    const out: string[] = [`수요 줄 ${r.rows.length}개를 만들 수 있습니다.`];
    if (r.notInCanon > 0) out.push(`정본에 없음 ${r.notInCanon}건 — 저장하지 않았습니다(새 사람·반·과목을 만들지 않습니다).`);
    const label = { teacher: '교사', klass: '반', subject: '과목' } as const;
    for (const k of ['teacher', 'klass', 'subject'] as const) {
        const list = r.missing[k];
        if (list.length === 0) continue;
        out.push(`${label[k]}: ` + list.map((m) => `${m.name}${m.reason === 'ambiguous' ? '(같은 이름이 여럿)' : ''} ${m.rows}줄`).join(', '));
    }
    if (r.bad.length > 0) out.push(`읽을 수 없는 줄 ${r.bad.length}개 — ` + r.bad.slice(0, 5).map((b) => `${b.line}줄 ${b.why}`).join(' / '));
    if (r.ignoredColumns.length > 0) out.push(`읽지 않은 열: ${r.ignoredColumns.join('·')}(선택 열은 아직 없습니다)`);
    return out;
}
