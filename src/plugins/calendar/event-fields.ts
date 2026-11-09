/**
 * 일정 ↔ 속성 목록(PropertyList) 어댑터 — 순수 함수(React 0 · 노드 0). 일정은 「제목 · 종일 · 언제 · 메모」 네 칸 레코드로 보인다.
 *   · 종일: `when` = {start: 'YYYY-MM-DD', end?: 마지막 날(포함)} — 하루짜리는 end 생략. 저장은 반열린(끝 = 마지막 날 다음 자정)이라 여기서 오간다.
 *   · 시간: `when` = {start, end} 둘 다 'YYYY-MM-DDTHH:mm'.
 *   ⭐ P4b: 저장 모양도 이 칸 꼴이다 — 일정 노드 data = 컬렉션 레코드(`values.when`·`values.memo` + 사용자 칸). 「종일」은 저장 안 한다
 *     (`when.start` 에 시각이 없으면 종일). 노드 ↔ EventData 변환은 eventToStored·storedToEvent 두 함수뿐이다.
 */
import type { DateValue, RecordCellValue, RecordField } from '../collection/contracts/collection';
import { isoMinuteOf, parseLocal, type CalEvent, type EventData } from './events';

/** 일정 노드 data — 컬렉션 레코드 꼴(칸 값은 values 하나 · 제목은 노드 이름). uid 는 칸이 아니라 .ics 가져오기 열쇠라 밖에 둔다. */
export interface StoredEvent { values: Record<string, RecordCellValue>; uid?: string }

/** EventData → 노드 data. prev(옛 values)의 사용자 칸은 그대로 두고 언제·메모만 갈아 끼운다. */
export function eventToStored(d: EventData, prev: Record<string, RecordCellValue> = {}): StoredEvent {
    const { when } = eventToValues({ name: '', start: d.start, end: d.end, allDay: d.allDay, memo: '' });
    const values: Record<string, RecordCellValue> = { ...prev, when };
    if (d.memo) values.memo = d.memo; else delete values.memo;
    return d.uid ? { values, uid: d.uid } : { values };
}

/** 노드 data → EventData. 「언제」가 없거나 깨졌으면 null(달력에 안 그린다). */
export function storedToEvent(data: unknown): EventData | null {
    const d = (data ?? {}) as Partial<StoredEvent>;
    const v = d.values && typeof d.values === 'object' ? d.values : {};
    const when = v.when as DateValue | undefined;
    if (!when || typeof when !== 'object' || typeof when.start !== 'string') return null;
    const f = valuesToEvent({ when, allDay: !when.start.includes('T'), memo: v.memo ?? '' });
    if (!f || Number.isNaN(parseLocal(f.start).getTime()) || Number.isNaN(parseLocal(f.end).getTime())) return null;
    const out: EventData = { start: f.start, end: f.end, allDay: f.allDay };
    if (f.memo) out.memo = f.memo;
    if (typeof d.uid === 'string') out.uid = d.uid;
    return out;
}

/** 폼이 다루는 일정 한 건 — 노드 이름(name) + EventData 중 속성 칸이 되는 것. */
export type EventForm = Pick<CalEvent, 'name' | 'start' | 'end' | 'allDay' | 'memo'>;

/** 일정의 칸 정의 — 「언제」 칸의 시각 유무는 종일 여부가 정한다. 전부 기본 칸(locked). */
export function eventFields(allDay: boolean): RecordField[] {
    return [
        { key: 'name', label: '제목', type: 'text', locked: true },
        { key: 'allDay', label: '종일', type: 'check', locked: true },
        { key: 'when', label: '언제', type: 'date', config: { time: !allDay, range: true }, locked: true },
        { key: 'memo', label: '메모', type: 'text', locked: true },
    ];
}

/** 'YYYY-MM-DD' 에 며칠 더한 날(지역 달력 기준 — 서머타임에 안 흔들린다). */
function addDays(day: string, n: number): string {
    const d = parseLocal(day);
    d.setDate(d.getDate() + n);
    return isoMinuteOf(d).slice(0, 10);
}

export function eventToValues(e: EventForm): Record<string, RecordCellValue> {
    const first = e.start.slice(0, 10);
    let when: DateValue;
    if (e.allDay) {
        const last = addDays(e.end.slice(0, 10), -1);   // 반열린 끝 → 포함하는 마지막 날
        when = last > first ? { start: first, end: last } : { start: first };
    } else {
        when = { start: e.start, end: e.end };
    }
    return { name: e.name, allDay: e.allDay, when, memo: e.memo };
}

const HOUR = 3_600_000;
const withTime = (s: string, hhmm: string) => (s.includes('T') ? s : `${s}T${hhmm}`);

/** 칸 값 → 일정. 「언제」가 비었으면 null(일정은 날짜가 없을 수 없다 — 호출자가 무시한다). */
export function valuesToEvent(v: Record<string, RecordCellValue>): EventForm | null {
    const when = v.when as DateValue | null | undefined;
    if (!when || typeof when !== 'object' || Array.isArray(when) || !when.start) return null;
    const name = String(v.name ?? '').trim() || '새 일정';
    const memo = String(v.memo ?? '');
    const first = when.start.slice(0, 10);
    if (v.allDay === true) {
        const last = when.end && when.end.slice(0, 10) > first ? when.end.slice(0, 10) : first;
        return { name, memo, allDay: true, start: `${first}T00:00`, end: `${addDays(last, 1)}T00:00` };
    }
    const start = withTime(when.start, '09:00');
    let end = withTime(when.end ?? start, '10:00');
    if (end <= start) end = isoMinuteOf(new Date(parseLocal(start).getTime() + HOUR));   // 끝이 시작보다 앞서면 한 시간 뒤로
    return { name, memo, allDay: false, start, end };
}

/** 칸 하나가 바뀌었을 때의 새 일정(바뀔 게 없거나 못 만들면 null). 종일 토글은 「언제」를 종일↔시간 모양으로 바꿔 준다. */
export function applyEventValue(e: EventForm, key: string, value: RecordCellValue): EventForm | null {
    const values = eventToValues(e);
    if (key === 'allDay') {
        const day = e.start.slice(0, 10);
        values.allDay = value === true;
        values.when = value === true ? { start: day } : { start: `${day}T09:00`, end: `${day}T10:00` };
    } else {
        values[key] = value;
    }
    return valuesToEvent(values);
}
