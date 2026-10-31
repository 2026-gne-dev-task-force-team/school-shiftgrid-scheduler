/**
 * ══════════════════════════════════════════════════════════════
 *  스케줄러 모델 — 「엑셀이 아니라 캘린더다」 (축 전환, 2026-10-31 설계)
 * ══════════════════════════════════════════════════════════════
 *  React 0줄 · DOM 0줄 · 순수. 모든 연산은 입력을 안 바꾸고 새 Schedule 을 돌려준다(검산·undo 가 쉽게).
 *
 *  🔴 벽시계(clock) 모델 — 시각은 저장하지 않는다. startTime 하나가 유일한 기준점이고
 *     줄의 시각도(rowTimes) 카드의 시각도(cardTime) 전부 startTime + 분 누적에서 파생된다.
 *     → 행 경계를 끌어 한 줄의 minutes 를 바꾸면 뒤 줄 시각은 "저절로" 밀린다(파생이라 미는 코드가 없다).
 *
 *  🔴 카드는 행에 묶이지 않는다 — colKey + start(분, 축 기준 오프셋)로 절대 배치된다.
 *     줄(Row)은 스냅 가이드이자 눈금일 뿐, 카드의 자리를 쥐지 않는다.
 *
 *  🔴 반복이 기본값이다(repeat: 'weekly') — 구글 캘린더와 반대로 단발(once)이 예외다(축 전환 설계).
 */

/** 5분 스냅 — 카드 이동·크기, 행 경계 끌기의 단위이자 최소 길이. ⛔ 이 상수를 끄면 손맛이 깨진다(버그 심기 자리). */
export const SNAP_MINUTES = 5;
export const MIN_CARD_MINUTES = 5;
export const MIN_ROW_MINUTES = 5;

/** 반복 — 기본은 매주. 단발이 예외다. */
export type Repeat = 'weekly' | 'once';

/**
 * Row — 눈금 한 줄. 시각은 안 갖는다(startTime + 누적으로 파생).
 *   minutes    이 줄의 길이(분) — 행 높이가 여기 비례. 경계를 끌면 이 값이 바뀐다.
 *   gapAfter   이 줄 다음의 빈 틈(분) — 쉬는 시간. 행이 아니라 행 사이의 얇은 틈으로 그린다.
 *   assignable 수업을 넣을 수 있는 줄인지(점심·청소로 끈 줄이면 false).
 */
export interface Row {
    key: string;
    label?: string;
    minutes: number;
    gapAfter: number;
    assignable: boolean;
}

/** Col — 한 열 = 무조건 하루. 주기(요일·N일차)는 열 개수와 머리 글자일 뿐이다. */
export interface Col {
    key: string;
    label: string;
}

/**
 * Card — 일정 카드. 캘린더의 한 블록(= 학교의 한 수업).
 *   colKey   어느 날(열)에 사는가.
 *   start    축 시작 시각(startTime) 기준 분 오프셋 — 카드의 세로 위치.
 *   minutes  길이(분) — 카드 높이.
 *   people   참석자(교사+반) — 보조인력은 "참석자 둘인 카드"로 자연히 풀린다(해부 9절).
 *   repeat   🔴 기본 'weekly'.
 *   attr     🔴 갈아끼울 자리 — 나중에 과목·교사 참조가 여기 붙는다(지금은 자유 글자).
 */
export interface Card {
    id: string;
    colKey: string;
    start: number;
    minutes: number;
    title: string;
    people: string[];
    place?: string;
    attr?: Record<string, unknown>;
    repeat: Repeat;
}

/** Schedule — 스케줄 한 장. 파일 하나가 될 몫(P3 에서 doc.plugins.scheduler 로 간다). */
export interface Schedule {
    startTime: string;   // "HH:mm" — 시간축의 유일한 기준점
    rows: Row[];
    cols: Col[];
    cards: Card[];
}

// ─────────────────────────── 시각 변환 ───────────────────────────

/** "HH:mm" → 분. 모양이 깨졌으면 0 */
export function toMins(hhmm: string): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
    if (!m) return 0;
    return Number(m[1]) * 60 + Number(m[2]);
}

/** 분 → "HH:mm" (24시를 넘으면 그대로 넘겨 보여 준다 — 줄이 많으면 드러나야 한다) */
export function fromMins(total: number): string {
    const t = Math.max(0, Math.round(total));
    const h = Math.floor(t / 60);
    const m = t % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 5분(또는 step) 격자에 맞춰 반올림한다 — 🔴 손맛의 핵심(스냅). */
export function snap(mins: number, step: number = SNAP_MINUTES): number {
    if (step <= 0) return Math.round(mins);
    return Math.round(mins / step) * step;
}

// ─────────────────────────── 파생(시각) ───────────────────────────

export interface RowTime { start: string; end: string }

/** 줄마다 시작·끝 "HH:mm" — 시간축의 유일한 파생. 🔴 뒤 줄은 앞 줄 길이·틈을 누적해 저절로 밀린다. */
export function rowTimes(startTime: string, rows: Row[]): RowTime[] {
    let pos = toMins(startTime);
    const out: RowTime[] = [];
    for (const r of rows) {
        const start = pos;
        const end = pos + Math.max(0, r.minutes);
        out.push({ start: fromMins(start), end: fromMins(end) });
        pos = end + Math.max(0, r.gapAfter || 0);
    }
    return out;
}

/** 축의 전체 길이(분) — 마지막 줄의 끝 오프셋(뒤따르는 틈은 세지 않는다). 줄이 없으면 0. */
export function axisSpanMinutes(rows: Row[]): number {
    let pos = 0;
    let span = 0;
    for (const r of rows) {
        const end = pos + Math.max(0, r.minutes);
        span = end;
        pos = end + Math.max(0, r.gapAfter || 0);
    }
    return span;
}

/** 한 카드의 시작·끝 "HH:mm" — startTime + 카드 오프셋에서 파생(카드도 시각을 저장 안 한다). */
export function cardTime(schedule: Schedule, card: Card): RowTime {
    const base = toMins(schedule.startTime);
    return { start: fromMins(base + card.start), end: fromMins(base + card.start + card.minutes) };
}

/** 줄 머리에 보일 글자 — 라벨이 있으면 그 글자, 없으면 수업 넣을 수 있는 줄만 세어 자동 번호. */
export function rowDisplayLabel(rows: Row[], index: number): string {
    const r = rows[index];
    if (!r) return '';
    if (r.label && r.label.trim()) return r.label;
    if (!r.assignable) return '';
    let n = 0;
    for (let i = 0; i <= index; i++) if (rows[i].assignable) n += 1;
    return String(n);
}

// ─────────────────────────── 카드 연산 ───────────────────────────

let _idSeq = 0;
/** 카드·행·열 id — 기기 간 병합 충돌을 막는 랜덤 꼬리(순수 함수는 아니나 모델 바깥 상태는 안 건드린다). */
export function genId(prefix = 'card'): string {
    _idSeq += 1;
    return `${prefix}-${_idSeq}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 카드 하나 더하기 — start·minutes 를 스냅하고 기본값(repeat:'weekly', people:[])을 채운다. */
export function addCard(
    schedule: Schedule,
    input: { id?: string; colKey: string; start: number; minutes: number; title: string; people?: string[]; place?: string; repeat?: Repeat; attr?: Record<string, unknown> },
): Schedule {
    const span = axisSpanMinutes(schedule.rows);
    const minutes = Math.max(MIN_CARD_MINUTES, snap(input.minutes));
    const start = clampStart(snap(input.start), minutes, span);
    const card: Card = {
        id: input.id ?? genId(),
        colKey: input.colKey,
        start,
        minutes,
        title: input.title,
        people: input.people ?? [],
        place: input.place,
        attr: input.attr,
        repeat: input.repeat ?? 'weekly',
    };
    return { ...schedule, cards: [...schedule.cards, card] };
}

/** 카드 지우기 */
export function removeCard(schedule: Schedule, id: string): Schedule {
    return { ...schedule, cards: schedule.cards.filter((c) => c.id !== id) };
}

/** 시작 오프셋을 축 안으로 가둔다(스냅은 호출 전에). */
function clampStart(start: number, minutes: number, span: number): number {
    const hi = Math.max(0, span - minutes);
    return Math.max(0, Math.min(hi, start));
}

/** 카드 옮기기 — 열·시각. 🔴 start 를 5분 스냅하고 축 안으로 가둔다. 없는 열이면 열은 그대로. */
export function moveCard(schedule: Schedule, id: string, to: { colKey?: string; start?: number }): Schedule {
    const span = axisSpanMinutes(schedule.rows);
    return {
        ...schedule,
        cards: schedule.cards.map((c) => {
            if (c.id !== id) return c;
            const colKey = to.colKey && schedule.cols.some((col) => col.key === to.colKey) ? to.colKey : c.colKey;
            const start = to.start === undefined ? c.start : clampStart(snap(to.start), c.minutes, span);
            return { ...c, colKey, start };
        }),
    };
}

/** 카드 크기 바꾸기(아래 잡아 늘리기) — 🔴 5분 스냅, 최소 MIN_CARD_MINUTES. 축을 넘지 않게. */
export function resizeCard(schedule: Schedule, id: string, minutes: number): Schedule {
    const span = axisSpanMinutes(schedule.rows);
    return {
        ...schedule,
        cards: schedule.cards.map((c) => {
            if (c.id !== id) return c;
            let m = Math.max(MIN_CARD_MINUTES, snap(minutes));
            if (span > 0) m = Math.min(m, span - c.start);
            return { ...c, minutes: Math.max(MIN_CARD_MINUTES, m) };
        }),
    };
}

/** 카드 속성 고치기(상세 패널) — start·minutes 가 오면 다시 스냅·가둔다. */
export function updateCard(schedule: Schedule, id: string, patch: Partial<Omit<Card, 'id'>>): Schedule {
    const span = axisSpanMinutes(schedule.rows);
    return {
        ...schedule,
        cards: schedule.cards.map((c) => {
            if (c.id !== id) return c;
            const next: Card = { ...c, ...patch };
            next.minutes = Math.max(MIN_CARD_MINUTES, snap(next.minutes));
            next.start = clampStart(snap(next.start), next.minutes, span);
            return next;
        }),
    };
}

// ─────────────────────────── 줄·열 연산 ───────────────────────────

/** 줄 길이 바꾸기(행 경계 끌기) — 🔴 5분 스냅, 최소 MIN_ROW_MINUTES. 뒤 줄은 파생이라 저절로 밀린다. */
export function resizeRow(schedule: Schedule, rowKey: string, minutes: number): Schedule {
    return {
        ...schedule,
        rows: schedule.rows.map((r) => (r.key === rowKey ? { ...r, minutes: Math.max(MIN_ROW_MINUTES, snap(minutes)) } : r)),
    };
}

/** 열 라벨 바꾸기 */
export function setColLabel(schedule: Schedule, colKey: string, label: string): Schedule {
    return { ...schedule, cols: schedule.cols.map((c) => (c.key === colKey ? { ...c, label } : c)) };
}

/** 요일 라벨 — 월~일, 그 뒤는 "N일". */
export function weekdayLabel(index: number): string {
    const w = ['월', '화', '수', '목', '금', '토', '일'];
    return index < w.length ? w[index] : `${index + 1}일`;
}

/** 열 하나 더하기(오른쪽 끝) */
export function addCol(schedule: Schedule): Schedule {
    const col: Col = { key: genId('col'), label: weekdayLabel(schedule.cols.length) };
    return { ...schedule, cols: [...schedule.cols, col] };
}

/** 열 지우기 — 그 열의 카드도 같이 간다. */
export function removeCol(schedule: Schedule, colKey: string): Schedule {
    return {
        ...schedule,
        cols: schedule.cols.filter((c) => c.key !== colKey),
        cards: schedule.cards.filter((c) => c.colKey !== colKey),
    };
}

// ─────────────────────────── 겹침 나누기(한 열 안) ───────────────────────────

/**
 * 한 열 안의 카드들을 나란히 놓는다 — 시간이 겹치면 폭을 나눈다.
 *   돌려주는 값: cardId → { lane, lanes }. 폭 = 1/lanes, 왼쪽 = lane/lanes.
 *   🔴 "같은 시간대 n개를 폭 1/n" — 이어진 겹침 덩어리(cluster) 안에서 lanes = 그 덩어리의 최대 동시 개수.
 */
export function columnLayout(cards: Card[]): Map<string, { lane: number; lanes: number }> {
    const sorted = [...cards].sort((a, b) => a.start - b.start || a.minutes - b.minutes || (a.id < b.id ? -1 : 1));
    const result = new Map<string, { lane: number; lanes: number }>();
    let cluster: Card[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        if (cluster.length === 0) return;
        const laneEnds: number[] = [];   // 레인별 마지막 카드의 끝
        const laneOf = new Map<string, number>();
        for (const c of cluster) {
            let placed = -1;
            for (let i = 0; i < laneEnds.length; i++) {
                if (laneEnds[i] <= c.start) { placed = i; break; }
            }
            if (placed < 0) { placed = laneEnds.length; laneEnds.push(0); }
            laneEnds[placed] = c.start + c.minutes;
            laneOf.set(c.id, placed);
        }
        const lanes = laneEnds.length;
        for (const c of cluster) result.set(c.id, { lane: laneOf.get(c.id)!, lanes });
        cluster = [];
        clusterEnd = -Infinity;
    };

    for (const c of sorted) {
        if (cluster.length > 0 && c.start >= clusterEnd) flush();
        cluster.push(c);
        clusterEnd = Math.max(clusterEnd, c.start + c.minutes);
    }
    flush();
    // 겹침이 없어도(혼자) lanes=1 로 답을 준다
    for (const c of cards) if (!result.has(c.id)) result.set(c.id, { lane: 0, lanes: 1 });
    return result;
}

// ─────────────────────────── 기본 스케줄 ───────────────────────────

/** 새 스케줄의 눈금 규칙 — 설정이 이 값을 덮는다(기본 시작·수업분·쉬는분·열 수). */
export interface GridDefaults {
    startTime: string;
    classMinutes: number;
    breakMinutes: number;
    rowCount: number;
    colCount: number;
}

export const DEFAULT_GRID: GridDefaults = {
    startTime: '09:00',
    classMinutes: 40,
    breakMinutes: 10,
    rowCount: 6,
    colCount: 5,
};

/** 규칙대로 줄·열을 세운다 — 카드는 손대지 않는다(새 스케줄·눈금 적용 공용). */
export function buildRowsCols(g: GridDefaults): { startTime: string; rows: Row[]; cols: Col[] } {
    const rows: Row[] = [];
    for (let i = 0; i < Math.max(1, g.rowCount); i++) {
        rows.push({ key: genId('row'), minutes: Math.max(MIN_ROW_MINUTES, g.classMinutes), gapAfter: Math.max(0, g.breakMinutes), assignable: true });
    }
    const cols: Col[] = [];
    for (let i = 0; i < Math.max(1, g.colCount); i++) cols.push({ key: genId('col'), label: weekdayLabel(i) });
    return { startTime: g.startTime, rows, cols };
}

/** 빈 주간 캘린더 한 장 — 5열(월~금) × 6줄(40분·쉬는 10·09:00). 카드 없음. */
export function defaultSchedule(g: GridDefaults = DEFAULT_GRID): Schedule {
    return { ...buildRowsCols(g), cards: [] };
}

/**
 * 눈금을 다시 세운다(설정에서 「적용」) — 줄·열을 규칙대로 갈고, 🔴 카드는 분 위치로 살려 둔다.
 *   살아남는 열은 index 순으로 새 열 키에 옮기고, 넘치는 카드(없어진 열·축 밖)는 떨어진다.
 */
export function applyGrid(schedule: Schedule, g: GridDefaults): Schedule {
    const built = buildRowsCols(g);
    const span = axisSpanMinutes(built.rows);
    // 옛 열 index → 새 열 키 (살아남는 만큼만)
    const cards: Card[] = [];
    for (const c of schedule.cards) {
        const oldIdx = schedule.cols.findIndex((col) => col.key === c.colKey);
        if (oldIdx < 0 || oldIdx >= built.cols.length) continue;   // 없어진 열이면 떨군다
        const newColKey = built.cols[oldIdx].key;
        if (c.start >= span) continue;                              // 축 밖이면 떨군다
        const minutes = Math.min(c.minutes, span - c.start);
        cards.push({ ...c, colKey: newColKey, minutes: Math.max(MIN_CARD_MINUTES, minutes) });
    }
    return { ...built, cards };
}
