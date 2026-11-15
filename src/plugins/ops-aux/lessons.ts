/** 번들(시간표 + 시간표 변경 + 학사 일정) → 날짜별 `DayLesson[]` 변환기 — 순수 함수. 번들에 시간표가 없으면 null(부른 쪽이 demo 로 떨어진다). */
import type { DayLesson } from '../../../shared/aux-engine/assign.ts';
import type { Bundle } from '../../../shared/bundle/types.ts';
import { toMin } from '../../../shared/clock.ts';

// 남의 플러그인 타입을 끌지 않는다 — 아래는 이 변환기가 실제로 읽는 필드만 담은 좁은 입력 타입(구조적 타이핑으로 번들 값이 그대로 들어온다).
interface CalendarEvent { kind: string; date: string; endDate?: string }
interface TimetableChange { date: string; classKey: string; period: number; subject: string }
interface Slot { index: number; label: string; start: string; end: string; assignable?: boolean; kind?: string }
interface Spec { id: string; activeDays: number[]; slots: Slot[]; lessonsPerDay?: number[] }
interface Track { id: string; name: string; grade?: number | null; specId?: string }
interface Timetable { id: string; specId: string; startDate: string; endDate?: string; priority: number }
interface Assignment { timetableId: string; trackId: string; dayIndex: number; slotIndex: number; activityId?: string }
interface Doc { specs: Spec[]; tracks: Track[]; timetables: Timetable[]; assignments: Assignment[]; activities: { id: string; name: string }[] }

const dayIndexOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=월
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** 번들에 시간표(doc)가 있으면 날짜 → 그날 수업 칸 함수, 없으면 null. */
export function lessonsFromBundle(bundle: Bundle | null | undefined): ((date: string) => DayLesson[]) | null {
    const doc = bundle?.parts.doc as Partial<Doc> | undefined;
    if (!doc || !Array.isArray(doc.tracks) || !Array.isArray(doc.specs) || !Array.isArray(doc.timetables)) return null;
    const calendar = arr<CalendarEvent>(bundle?.parts.calendar);
    const changes = arr<TimetableChange>(bundle?.parts.changes);
    const specs = doc.specs, tracks = doc.tracks, assignments = arr<Assignment>(doc.assignments);
    const nameOf = (id?: string) => doc.activities?.find((a) => a.id === id)?.name ?? null;

    return (date) => {
        // 학교 전체 쉼(휴업일) → 수업 없음
        if (calendar.some((c) => c.kind === 'all' && c.date <= date && date <= (c.endDate || c.date))) return [];
        const di = dayIndexOf(date);
        // 그날을 덮는 시간표 중 우선순위가 가장 높은 하나
        const tt = doc.timetables!.filter((t) => t.startDate <= date && (!t.endDate || date <= t.endDate)).sort((a, b) => b.priority - a.priority)[0];
        if (!tt) return [];
        const out: DayLesson[] = [];
        for (const track of tracks) {
            const spec = specs.find((s) => s.id === (track.specId ?? tt.specId));
            if (!spec || !spec.activeDays.includes(di)) continue;
            const lessonSlots = spec.slots.filter((s) => s.assignable !== false && (s.kind ?? 'lesson') === 'lesson').slice(0, spec.lessonsPerDay?.[di] ?? Infinity);
            lessonSlots.forEach((slot, i) => {
                const cell = assignments.find((a) => a.timetableId === tt.id && a.trackId === track.id && a.dayIndex === di && a.slotIndex === slot.index);
                const change = changes.find((c) => c.date === date && c.classKey === track.name && c.period === i + 1);
                out.push({
                    trackName: track.name, grade: track.grade ?? null, label: slot.label,
                    startMin: toMin(slot.start), endMin: toMin(slot.end),
                    subject: change ? change.subject : nameOf(cell?.activityId),
                    available: true,
                });
            });
        }
        return out;
    };
}
