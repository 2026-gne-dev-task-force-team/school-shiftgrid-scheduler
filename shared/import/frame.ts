/**
 * 시간 틀 — 학급 표의 줄 머리(「4」·「09:00~09:50」·「4(3,4학년)」)를 시각으로 읽는 규칙(운영 앱 row-time.ts 이식).
 * DB·서버 없이 도는 순수 꼴. 입력(FrameInput)은 시간표 판본에서 뽑은 평범한 자료 — 어디서 뽑는지는 부르는 쪽 몫.
 *
 *   1. 줄 머리에 시각이 있으면            그 시각
 *   2. 교시와 학년이 있으면               그 학년의 그 교시       「4(3,4학년)」
 *   3. 교시 번호만, 열 주인이 반이면      그 반 시간 틀의 그 교시
 *   4. 교시 번호만, 모든 학년 시각이 같으면 그 시각
 *   5. 교시 번호만, 학년마다 다르면        정하지 않고 묻는다
 */
export interface FrameSlot { idx: number; start: string; end: string; label: string; assignable: boolean; kind?: 'lesson' | 'lunch' | string }
export interface FrameTrack { name: string; grade: number | null; homeroomName?: string | null; specKey: string | null }
/** 배치가 있는 칸 — 전담(specialist)이면 편성 결과가 기준이다. */
export interface FrameCell { trackName: string; dayIndex: number; idx: number; specialist: boolean; subject: string | null }
export interface FrameInput {
    tracks: FrameTrack[];
    /** specKey(학년군) → 그 학년군의 하루 틀 */
    slots: Record<string, FrameSlot[]>;
    /** specKey → 요일(0=월) → 그날 수업 칸 수(앞에서부터). 없으면 수업 칸 전부 */
    lessonsPerDay?: Record<string, Record<string, number>>;
    cells: FrameCell[];
}
export interface TimeRow { start: string; end: string; labels: string[] }
export interface RowResolution {
    start: string | null;
    reason: string;
    options?: { start: string; grades: number[] }[];
}
export interface Lesson { idx: number; start: string; end: string; label: string; specialist: boolean; subject: string | null }

const periodOfLabel = (label: string): number | null => {
    const m = /(\d+)\s*교시/.exec(label);
    return m ? Number(m[1]) : null;
};

export class TimeFrame {
    /** 모든 반의 수업·점심 시각(줄 머리용). 시작 시각 순 */
    readonly times: TimeRow[];
    private readonly specKeys: string[];
    private readonly v: FrameInput;
    constructor(v: FrameInput) {
        this.v = v;
        this.specKeys = Object.keys(v.slots).sort();
        const byStart = new Map<string, { end: string; labels: Map<string, string> }>();
        for (const k of this.specKeys) for (const s of v.slots[k]) {
            if (!byStart.has(s.start)) byStart.set(s.start, { end: s.end, labels: new Map() });
            byStart.get(s.start)!.labels.set(k, s.label);
        }
        this.times = [...byStart.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([start, x]) => ({ start, end: x.end, labels: this.specKeys.map((k) => x.labels.get(k) ?? '—') }));
    }
    get tracks(): FrameTrack[] { return this.v.tracks; }
    track(name: string): FrameTrack | undefined { return this.v.tracks.find((t) => t.name === name); }
    grades(): number[] { return [...new Set(this.v.tracks.map((t) => t.grade).filter((g): g is number => g != null))].sort((a, b) => a - b); }

    periodOfTrack(trackName: string, period: number): { start: string; end: string } | null {
        const t = this.track(trackName);
        const s = t?.specKey ? this.v.slots[t.specKey]?.find((x) => x.assignable && periodOfLabel(x.label) === period) : undefined;
        return s ? { start: s.start, end: s.end } : null;
    }
    periodOfGrade(grade: number, period: number): { start: string; end: string } | null {
        const t = this.v.tracks.find((x) => x.grade === grade);
        return t ? this.periodOfTrack(t.name, period) : null;
    }
    /** 반의 그 요일 수업 칸(수업 슬롯을 앞에서부터 lessonsPerDay 만큼 + 배치가 있는 슬롯) */
    lessonsOf(trackName: string, dayIndex: number): Lesson[] {
        const t = this.track(trackName);
        if (!t?.specKey) return [];
        const slots = this.v.slots[t.specKey] ?? [];
        const lessons = slots.filter((s) => s.assignable && (s.kind ?? 'lesson') === 'lesson');
        const n = this.v.lessonsPerDay?.[t.specKey]?.[String(dayIndex)];
        const keep = new Set((n == null ? lessons : lessons.slice(0, n)).map((s) => s.idx));
        const placed = new Map(this.v.cells.filter((c) => c.trackName === trackName && c.dayIndex === dayIndex).map((c) => [c.idx, c] as const));
        for (const i of placed.keys()) keep.add(i);
        return slots.filter((s) => keep.has(s.idx)).map((s) => {
            const c = placed.get(s.idx);
            return { idx: s.idx, start: s.start, end: s.end, label: s.label, specialist: c?.specialist ?? false, subject: c?.subject ?? null };
        });
    }
    lunchOf(trackName: string): string | null {
        const t = this.track(trackName);
        const s = t?.specKey ? this.v.slots[t.specKey]?.find((x) => x.kind === 'lunch' || x.label.includes('점심')) : undefined;
        return s?.start ?? null;
    }

    /** 줄 머리 하나를 시각으로. ownerTrack 은 그 열의 주인이 반일 때 그 반 이름 */
    resolve(label: string, ownerTrack?: string | null): RowResolution {
        const text = label.replace(/\s+/g, ' ').trim();
        const tm = /(\d{1,2}):(\d{2})/.exec(text);
        if (tm) {
            const s = tm[1].padStart(2, '0') + ':' + tm[2];
            return this.times.some((t) => t.start === s) ? { start: s, reason: '줄 머리의 시각' } : { start: null, reason: s + ' 은 시간표에 없는 시각' };
        }
        const hints = [...text.matchAll(/(\d+)\s*\(\s*([\d,\s·]+?)\s*학년\s*\)/g)];
        if (hints.length) {
            const found = new Map<string, number[]>();
            for (const h of hints) {
                const p = Number(h[1]);
                for (const g of h[2].split(/[,\s·]+/).filter(Boolean).map(Number)) {
                    const r = this.periodOfGrade(g, p);
                    if (r) { if (!found.has(r.start)) found.set(r.start, []); found.get(r.start)!.push(g); }
                }
            }
            if (found.size === 1) { const [s, gs] = [...found.entries()][0]; return { start: s, reason: gs.join('·') + '학년 시간 틀' }; }
            if (found.size > 1) return { start: null, reason: '적힌 학년들의 시각이 서로 다름', options: [...found.entries()].map(([start, grades]) => ({ start, grades })) };
        }
        const num = /^(\d+)/.exec(text);
        if (!num) return { start: null, reason: '시각이나 교시를 알 수 없음' };
        const p = Number(num[1]);
        if (ownerTrack) {
            const r = this.periodOfTrack(ownerTrack, p);
            const g = this.track(ownerTrack)?.grade;
            return r ? { start: r.start, reason: (g ?? '') + '학년 시간 틀' } : { start: null, reason: ownerTrack + ' 에 ' + p + '교시가 없음' };
        }
        const found = new Map<string, number[]>();
        for (const g of this.grades()) {
            const r = this.periodOfGrade(g, p);
            if (r) { if (!found.has(r.start)) found.set(r.start, []); found.get(r.start)!.push(g); }
        }
        if (found.size === 1) return { start: [...found.keys()][0], reason: '모든 학년이 같은 시각' };
        if (found.size === 0) return { start: null, reason: p + '교시가 있는 학년이 없음' };
        return { start: null, reason: p + '교시는 학년마다 시각이 다름', options: [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, grades]) => ({ start, grades })) };
    }
}
