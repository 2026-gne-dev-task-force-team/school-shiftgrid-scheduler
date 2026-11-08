/**
 * .ics 파서·작성기 — 종일·UTC·TZID·줄 접힘·이스케이프·YEARLY · 작성기 왕복(내보내기→가져오기 같은 일정).
 *   🔴 시각 변환(Z·KST)은 기기 TZ 와 무관하게 재려고 「instant 왕복」으로 검사한다
 *      — parseLocal(지역문자열).getTime() 이 원래 절대시각과 같으면 변환이 맞다.
 *   종일/떠있는 값은 변환이 없어 글자 그대로 비교한다.
 */
import { describe, it, expect } from 'vitest';
import { parseIcs, writeIcs, foldLine, escapeText, MAX_YEARLY, type IcsWriteEvent } from './ics';
import { parseLocal } from './events';

// 실제 구글 공휴일 ics 의 한 조각(VALUE=DATE 종일) — curl 로 받은 꼴(2026-11-08 실측).
const HOLIDAY = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20220601',
    'DTEND;VALUE=DATE:20220602',
    'DTSTAMP:20261108T133801Z',
    'UID:20220601_38j2hgqjvupie4drb6g1fu14ig@google.com',
    'DESCRIPTION:공휴일',
    'SUMMARY:지방선거일',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');

describe('파서 — 종일(VALUE=DATE)', () => {
    const items = parseIcs(HOLIDAY);
    it('한 개를 읽는다', () => { expect(items.length).toBe(1); });
    it('종일·제목·메모·UID', () => {
        const e = items[0];
        expect(e.allDay).toBe(true);
        expect(e.title).toBe('지방선거일');
        expect(e.memo).toBe('공휴일');
        expect(e.id).toBe('20220601_38j2hgqjvupie4drb6g1fu14ig@google.com');
    });
    it('start 종일 문자열 · end 는 DTEND(배타) 그대로', () => {
        expect(items[0].start).toBe('2022-06-01');
        expect(items[0].end).toBe('2022-06-02');
    });
});

describe('파서 — UTC(Z)·TZID(Asia/Seoul)는 절대시각 왕복으로 맞다', () => {
    it('Z: 2026-06-01T00:00Z 가 지역문자열로 왕복되면 같은 절대시각', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART:20260601T000000Z\nDTEND:20260601T010000Z\nUID:z1\nSUMMARY:utc\nEND:VEVENT';
        const e = parseIcs(ics)[0];
        expect(e.allDay).toBe(false);
        expect(parseLocal(e.start).getTime()).toBe(Date.UTC(2026, 5, 1, 0, 0));
        expect(parseLocal(e.end).getTime()).toBe(Date.UTC(2026, 5, 1, 1, 0));
    });
    it('TZID=Asia/Seoul: 09:00 KST = 00:00Z', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;TZID=Asia/Seoul:20260601T090000\nUID:k1\nSUMMARY:kst\nEND:VEVENT';
        const e = parseIcs(ics)[0];
        expect(parseLocal(e.start).getTime()).toBe(Date.UTC(2026, 5, 1, 0, 0));
    });
    it('떠 있는 지역시각(TZID·Z 없음)은 벽시계 그대로', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART:20260601T093000\nUID:f1\nSUMMARY:float\nEND:VEVENT';
        expect(parseIcs(ics)[0].start).toBe('2026-06-01T09:30');
    });
});

describe('파서 — 줄 접힘·이스케이프', () => {
    it('이어쓰기(공백 선두) 줄을 하나로 잇는다', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:u\nSUMMARY:아주 긴 제\n 목입니다\nEND:VEVENT';
        expect(parseIcs(ics)[0].title).toBe('아주 긴 제목입니다');
    });
    it('이스케이프(\\, \\; \\n)를 되돌린다', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:u\nSUMMARY:쉼표\\, 세미콜론\\; 줄\\n바꿈\nEND:VEVENT';
        expect(parseIcs(ics)[0].title).toBe('쉼표, 세미콜론; 줄\n바꿈');
    });
});

describe('파서 — DTEND 기본값', () => {
    it('종일인데 DTEND 없으면 1일(다음 날)', () => {
        const e = parseIcs('BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:u\nSUMMARY:s\nEND:VEVENT')[0];
        expect(e.start).toBe('2026-01-01');
        expect(e.end).toBe('2026-01-02');
    });
    it('시각인데 DTEND 없으면 길이 0(start=end)', () => {
        const e = parseIcs('BEGIN:VEVENT\nDTSTART:20260101T090000\nUID:u\nSUMMARY:s\nEND:VEVENT')[0];
        expect(e.end).toBe(e.start);
    });
    it('DTSTART 없으면 그 VEVENT 는 건너뛴다', () => {
        expect(parseIcs('BEGIN:VEVENT\nUID:u\nSUMMARY:s\nEND:VEVENT')).toEqual([]);
    });
});

describe('파서 — RRULE', () => {
    it('FREQ=YEARLY;COUNT=3 → 3회, 해마다', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:y\nSUMMARY:새해\nRRULE:FREQ=YEARLY;COUNT=3\nEND:VEVENT';
        const items = parseIcs(ics);
        expect(items.map((e) => e.start)).toEqual(['2026-01-01', '2027-01-01', '2028-01-01']);
        expect(items.map((e) => e.id)).toEqual(['y', 'y#1', 'y#2']);
    });
    it('FREQ=YEARLY;UNTIL 로 끊긴다', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:y\nSUMMARY:s\nRRULE:FREQ=YEARLY;UNTIL=20271231\nEND:VEVENT';
        expect(parseIcs(ics).map((e) => e.start)).toEqual(['2026-01-01', '2027-01-01']);
    });
    it('FREQ=YEARLY;INTERVAL=2', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:y\nSUMMARY:s\nRRULE:FREQ=YEARLY;INTERVAL=2;COUNT=3\nEND:VEVENT';
        expect(parseIcs(ics).map((e) => e.start)).toEqual(['2026-01-01', '2028-01-01', '2030-01-01']);
    });
    it('경계 없는 YEARLY 는 MAX_YEARLY 로 막는다', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260101\nUID:y\nSUMMARY:s\nRRULE:FREQ=YEARLY\nEND:VEVENT';
        expect(parseIcs(ics).length).toBe(MAX_YEARLY);
    });
    it('YEARLY 아닌 RRULE(WEEKLY)은 첫 회만', () => {
        const ics = 'BEGIN:VEVENT\nDTSTART:20260101T090000\nUID:w\nSUMMARY:s\nRRULE:FREQ=WEEKLY;COUNT=10\nEND:VEVENT';
        expect(parseIcs(ics).length).toBe(1);
    });
});

describe('작성기 — 표준 꼴', () => {
    const ev: IcsWriteEvent = { uid: 'a1', title: '회의', start: '2026-06-01T09:00', end: '2026-06-01T10:00', allDay: false, memo: '쉼표,포함' };
    const out = writeIcs([ev], new Date(Date.UTC(2026, 10, 8, 1, 2, 3)));
    it('VCALENDAR·VERSION·PRODID·UID·DTSTAMP 가 있다', () => {
        expect(out).toContain('BEGIN:VCALENDAR');
        expect(out).toContain('VERSION:2.0');
        expect(out).toContain('PRODID:');
        expect(out).toContain('UID:a1');
        expect(out).toContain('DTSTAMP:20261108T010203Z');
    });
    it('CRLF 로 끝난다', () => { expect(out.endsWith('\r\n')).toBe(true); expect(out).toContain('\r\n'); });
    it('메모의 쉼표를 이스케이프한다', () => { expect(out).toContain('DESCRIPTION:쉼표\\,포함'); });
    it('종일은 VALUE=DATE 와 배타 DTEND', () => {
        const d = writeIcs([{ uid: 'b', title: '종일', start: '2026-06-01T00:00', end: '2026-06-02T00:00', allDay: true }]);
        expect(d).toContain('DTSTART;VALUE=DATE:20260601');
        expect(d).toContain('DTEND;VALUE=DATE:20260602');
    });
});

describe('작성기 ↔ 파서 왕복 — 같은 일정', () => {
    const evs: IcsWriteEvent[] = [
        { uid: 'u-timed', title: '시각 일정', start: '2026-06-01T09:00', end: '2026-06-01T10:30', allDay: false, memo: '메모' },
        { uid: 'u-allday', title: '종일 일정', start: '2026-06-03T00:00', end: '2026-06-04T00:00', allDay: true },
    ];
    const round = parseIcs(writeIcs(evs));
    it('개수가 같다', () => { expect(round.length).toBe(2); });
    it('시각 일정이 같은 절대시각·제목·메모', () => {
        const e = round.find((x) => x.id === 'u-timed')!;
        expect(e.allDay).toBe(false);
        expect(e.title).toBe('시각 일정');
        expect(e.memo).toBe('메모');
        expect(parseLocal(e.start).getTime()).toBe(parseLocal('2026-06-01T09:00').getTime());
        expect(parseLocal(e.end).getTime()).toBe(parseLocal('2026-06-01T10:30').getTime());
    });
    it('종일 일정이 같은 날·배타 끝', () => {
        const e = round.find((x) => x.id === 'u-allday')!;
        expect(e.allDay).toBe(true);
        expect(e.start).toBe('2026-06-03');
        expect(e.end).toBe('2026-06-04');
    });
});

describe('줄 접힘(folding)은 75옥텟을 넘지 않는다', () => {
    it('긴 줄이 \\r\\n+공백 으로 접힌다', () => {
        const long = 'SUMMARY:' + '가'.repeat(60);   // 한글은 3옥텟 → 180+옥텟
        const folded = foldLine(long);
        expect(folded).toContain('\r\n ');
        for (const seg of folded.split('\r\n ')) {
            expect(new TextEncoder().encode(seg).length).toBeLessThanOrEqual(75);
        }
    });
    it('escapeText 는 역슬래시를 먼저 처리한다', () => {
        expect(escapeText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
    });
});
