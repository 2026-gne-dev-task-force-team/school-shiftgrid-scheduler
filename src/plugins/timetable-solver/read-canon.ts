/**
 * F5b 연결부 — 정본(교직원·학교·과목·방·일과표·복무·시수표·시간표 기간)을 **읽기만** 해 편성 입력으로 잇는다.
 *   🔴 정본 값을 편성 쪽에 다시 저장하지 않는다 — 부를 때마다 읽고 버린다. 저장하는 것은 편성 막힘(blocks-store) 하나뿐.
 *   읽는 길 둘: ① 약속 모듈(staff·school·subjects·rooms) ② 노드 줄(일과표·복무·시수표·시간표 — 아직 약속이 없어 노드 타입 이름으로).
 *   ⛔ 다른 플러그인 값 import 0(구조 검사 ⑨) — 노드 타입 이름·칸 key 는 거기서 고정한 값을 여기 적어 두고, 시험이 지킨다.
 *   정본이 비어 편성이 안 되는 경우는 「편성 막힘」(PlanBlocker) 목록으로 모아 선생님 말로 돌려준다.
 */
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { Rooms } from '../rooms/contracts/rooms';
import type { Clock, ClassSlot } from '../bell/contracts/clock';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type {
    BlockerFix, BuildIssue, CanonBellRow, CanonDemandRow, CanonDutyRow, PlanBlocker, SolverBlockRow, SolverCanon,
} from './contracts/solver';
import { buildSolverInput, type BuildModules, type BuildResult } from './build-context';
import { loadBlocks } from './blocks-store';

/** 노드 타입 이름 — 각 정본 플러그인이 고정한 값(시험이 그 플러그인의 상수와 같은지 지킨다). */
export const NODE_TYPES = {
    bellSlot: 'bell.slot',
    dutyEntry: 'duty.entry',
    demandRow: 'demand-table.row',
    gridSheet: 'timetable-grid.sheet',
} as const;

/** 노드 줄 하나 — 이름 + 칸 값(컬렉션 줄은 data.values). */
export interface RowLike { id: string; name: string; values: Record<string, unknown> }

/** 읽는 쪽에 필요한 것 전부 — 시험은 가짜를 꽂고, 실제는 canonSourcesFromHost 가 만든다. */
export interface CanonSources {
    staff: Staff | null;
    school: School | null;
    subjects: Subjects | null;
    rooms: Rooms | null;
    /** 그 타입의 살아 있는 노드 줄들(휴지통 제외). */
    rows(type: string): RowLike[];
    /** 시간표 한 장마다 데이터(range 를 가진 객체) — 기간만 읽는다. */
    sheetData(): unknown[];
    blocks: readonly SolverBlockRow[];
    /** 일과표 약속(clock)이 그 학년에 대해 읽어 주는 수업 칸 시각 — 정본을 약속으로 읽는다. 없으면(꺼짐·시험) 노드 줄만 쓴다. */
    classSlots?(grade: number): ClassSlot[];
}

const str = (x: unknown): string | undefined => (typeof x === 'string' && x !== '' ? x : undefined);
const first = (x: unknown): string | undefined => str(Array.isArray(x) ? x[0] : x);
const ids = (x: unknown): string[] | undefined => {
    const arr = Array.isArray(x) ? x : x == null ? [] : [x];
    const out = arr.filter((v): v is string => typeof v === 'string' && v !== '');
    return out.length ? out : undefined;
};
const dateOf = (x: unknown): string | { start: string } | null => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object' && typeof (x as { start?: unknown }).start === 'string') return { start: (x as { start: string }).start };
    return null;
};

function bellRows(rows: RowLike[]): CanonBellRow[] {
    return rows.map((r) => {
        const v = r.values;
        return {
            kind: str(v.f_kind), period: typeof v.f_period === 'number' ? v.f_period : null,
            start: str(v.f_start), end: str(v.f_end), grades: Array.isArray(v.f_grades) ? (v.f_grades as string[]) : [],
        };
    });
}

/**
 * 일과표 약속이 읽어 주는 수업 칸을 보탠다 — 노드 줄만으로는 그 학년의 수업 칸이 안 읽히는데 약속은 읽을 수 있으면(칸 꼴이 어긋난 경우)
 *   그 학년 줄로 채운다. 노드 줄이 이미 읽히면 건드리지 않는다(점심·쉬는 시간 줄을 잃지 않게).
 */
function withClockSlots(bell: CanonBellRow[], classes: SolverCanon['classes'], src: CanonSources): CanonBellRow[] {
    if (!src.classSlots) return bell;
    const have = (g: number) => bell.some((r) => r.kind === 'class' && r.start && r.end && (!r.grades?.length || r.grades.includes(String(g))));
    const out = [...bell];
    const grades = [...new Set(classes.map((c) => c.grade).filter((g): g is number => typeof g === 'number'))];
    for (const g of grades) {
        if (have(g)) continue;
        for (const s of src.classSlots(g)) out.push({ kind: 'class', period: s.period, start: s.start, end: s.end, grades: [String(g)] });
    }
    return out;
}

function dutyRows(rows: RowLike[]): CanonDutyRow[] {
    return rows.map((r) => ({
        id: r.id, name: r.name,
        person: ids(r.values.f_person) ?? null,
        start: dateOf(r.values.f_start) as CanonDutyRow['start'],
        end: dateOf(r.values.f_end) as CanonDutyRow['end'],
        allDay: r.values.f_allday === true,
        periods: str(r.values.f_periods) ?? null,
    }));
}

function demandRows(rows: RowLike[]): CanonDemandRow[] {
    return rows.map((r) => {
        const h = r.values.f_hours;
        return {
            id: r.id, teacherId: first(r.values.f_teacher), classId: first(r.values.f_class),
            subjectId: first(r.values.f_subject), ...(typeof h === 'number' ? { hours: h } : {}),
        };
    });
}

/** 편성 기간 — 시간표 중 기간(두 날짜 다 있음)이 정해진 첫 장. 없으면 null. */
function rangeOf(sheets: unknown[]): { startDate: string; endDate: string } | null {
    for (const d of sheets) {
        const r = (d as { range?: { kind?: string; start?: unknown; end?: unknown } } | null)?.range;
        if (r?.kind === 'period' && str(r.start) && str(r.end)) return { startDate: r.start as string, endDate: r.end as string };
    }
    return null;
}

export interface ReadResult { canon: SolverCanon; blockers: PlanBlocker[] }

/** 정본 읽기 → 읽은 값 한 묶음 + 정본이 없어서 생기는 막힘(꺼진 플러그인·빈 명단·기간 없음). */
export function readCanon(src: CanonSources): ReadResult {
    const blockers: PlanBlocker[] = [];
    const off = (code: string, what: string) => blockers.push({ code, level: 'stop', message: `${what} 플러그인이 꺼져 있어 읽을 수 없습니다` });   // 꺼진 것은 열 화면이 없어 fix 를 안 단다

    const staffRows = src.staff
        ? src.staff.lists().flatMap((l) => src.staff!.staffIn(l.id)).map((m) => ({
            id: m.id, name: m.name, kind: m.kind, tier: m.tier, homeroomClassIds: m.homeroomClassIds,
        }))
        : (off('staff-off', '교직원 명단'), []);

    let classes: SolverCanon['classes'] = [];
    let schoolName = '';
    if (src.school) {
        schoolName = src.school.school()?.name ?? '';
        const years = src.school.years();
        const year = years[years.length - 1];   // 가장 나중 학년도 — 여러 해가 있으면 올해를 마지막에 둔다는 전제(🙋)
        classes = year ? src.school.classesIn(year.id).map((c) => ({ id: c.id, name: c.name, grade: c.grade })) : [];
    } else off('school-off', '학교 정보');

    const subjects = src.subjects
        ? src.subjects.lists().flatMap((l) => src.subjects!.subjectsIn(l.id)).map((s) => ({ id: s.id, name: s.name }))
        : (off('subjects-off', '과목 목록'), []);

    const rooms = src.rooms
        ? src.rooms.lists().flatMap((l) => src.rooms!.roomsIn(l.id)).flatMap((r) => {
            const p = src.rooms!.roomProps(r.id);
            return p.active ? [{ id: r.id, name: r.name, ...(p.capacity !== undefined ? { capacity: p.capacity } : {}) }] : [];
        })
        : [];   // 방은 없어도 편성된다 — 막힘이 아니라 build 쪽 안내(note)로만

    const range = rangeOf(src.sheetData());
    if (!range) blockers.push({ code: 'no-range', level: 'note', message: '편성 기간(시간표의 시작·끝 날짜)이 정해지지 않았습니다 — 기간 없이 짭니다' });

    const canon: SolverCanon = {
        school: { name: schoolName },
        range: range ?? { startDate: '', endDate: '' },
        staff: staffRows, classes, subjects, rooms,
        bell: withClockSlots(bellRows(src.rows(NODE_TYPES.bellSlot)), classes, src),
        duty: dutyRows(src.rows(NODE_TYPES.dutyEntry)),
        demands: demandRows(src.rows(NODE_TYPES.demandRow)),
        blocks: src.blocks,
    };
    return { canon, blockers };
}

const count = (issues: BuildIssue[], source: BuildIssue['source']) => issues.filter((i) => i.source === source).length;

/**
 * 막힘 목록 — 읽은 값 + 조립 결과에서 「왜 못 짜나」를 선생님 말로 모은다. 비면 편성할 수 있다.
 *   stop 이 하나라도 있으면 편성 버튼을 막는 근거로 쓴다 · note 는 알려만 준다.
 */
export function planBlockers(canon: SolverCanon, built: BuildResult, readBlockers: PlanBlocker[] = []): PlanBlocker[] {
    const out: PlanBlocker[] = [...readBlockers];
    const stop = (code: string, message: string, fix?: BlockerFix) => out.push({ code, level: 'stop', message, ...(fix ? { fix } : {}) });
    const note = (code: string, message: string, fix?: BlockerFix) => out.push({ code, level: 'note', message, ...(fix ? { fix } : {}) });
    const have = (code: string) => out.some((b) => b.code === code);

    if (canon.staff.length === 0 && !have('staff-off')) stop('no-staff', '교직원 명단에 선생님이 한 분도 없습니다', 'staff');
    if (canon.classes.length === 0 && !have('school-off')) stop('no-class', '학교 정보에 반이 하나도 없습니다 — 학교 정보에서 반을 먼저 넣어 주세요', 'school');
    if (canon.subjects.length === 0 && !have('subjects-off')) stop('no-subject', '과목 목록이 비어 있습니다', 'subjects');
    // 🔴 시간 틀은 반의 학년마다 일과표를 읽어 만든다 — 학년 있는 반이 0개면 틀이 0개인 까닭은 일과표가 아니라 반이다(T-10fm)
    const gradedClass = canon.classes.some((c) => c.grade !== undefined);
    if (canon.bell.length === 0) stop('no-bell', '일과표에 교시가 하나도 없습니다', 'bell');
    else if (built.input.specs.length === 0 && gradedClass) stop('no-slots', '일과표에서 수업 시간을 읽지 못했습니다 — 일과표에 학년별 수업 칸(구분 「수업」·교시·시작·끝 시각)을 넣어 주세요. 학년 칸을 비우면 전 학년입니다', 'bell');
    const noGrade = canon.classes.filter((c) => c.grade === undefined).length;
    if (noGrade > 0) stop('no-grade', `학년이 정해지지 않은 반이 ${noGrade}개 있어 시간 틀을 못 맞춥니다`, 'school');
    if (built.input.demands.length === 0) stop('no-demand', canon.demands.length === 0 ? '시수표에 수업 줄이 하나도 없습니다' : '시수표의 모든 줄에 빈 칸이 있어 쓸 수 있는 수업이 없습니다', 'demand');
    else if (built.input.demands.every((d) => d.count <= 0)) stop('zero-hours', '시수가 모두 0 시간입니다', 'demand');

    const badDemand = count(built.issues, 'demand');
    if (badDemand > 0 && built.input.demands.length > 0) note('bad-demand', `시수표에서 ${badDemand}줄은 빈 칸이 있거나 정본에서 찾을 수 없어 뺐습니다`, 'demand');
    const badDuty = count(built.issues, 'duty');
    if (badDuty > 0) note('bad-duty', `복무 기록 ${badDuty}건은 편성 대상이 아니거나 시각을 몰라 일부 뺐습니다`);
    const badBlock = count(built.issues, 'block');
    if (badBlock > 0) note('bad-block', `편성 막힘 ${badBlock}건은 토·일이라 편성에 안 쓰입니다`);
    if (canon.rooms.length === 0) note('no-room', '쓸 수 있는 특별실(방)이 없습니다 — 방이 필요한 수업은 방 없이 짭니다');
    return out;
}

/** 한 번에 — 정본 읽기 → 조립 → 막힘 목록. 화면·편성 버튼이 이 하나만 부른다. */
export function readAndBuild(src: CanonSources, mods: BuildModules): ReadResult & BuildResult & { blockers: PlanBlocker[] } {
    const read = readCanon(src);
    const built = buildSolverInput(read.canon, mods);
    return { ...read, ...built, blockers: planBlockers(read.canon, built, read.blockers) };
}

/** 실제 호스트에서 읽을 손잡이를 만든다 — 약속 넷은 supports 로 선언돼 있어야 한다(꺼져 있으면 null). */
export function canonSourcesFromHost(host: PluginHost): CanonSources {
    const nodes = host.modules.use<NodesApi>('nodes');
    const clock = host.modules.use<Clock>('clock');
    return {
        staff: host.modules.use<Staff>('staff'),
        school: host.modules.use<School>('school'),
        subjects: host.modules.use<Subjects>('subjects'),
        rooms: host.modules.use<Rooms>('rooms'),
        rows: (type) => (nodes?.liveByType(type) ?? []).map((n) => {
            const d = n.data as { values?: Record<string, unknown> } | null | undefined;
            return { id: n.id, name: n.name, values: d?.values ?? {} };
        }),
        sheetData: () => (nodes?.liveByType(NODE_TYPES.gridSheet) ?? []).map((n) => n.data),
        blocks: loadBlocks(host),
        classSlots: clock ? (g) => clock.slotsFor(g) : undefined,
    };
}
