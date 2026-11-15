/**
 * 학급 시간표(담임 과목) 불러오기 — 운영 앱 class-import.test.ts 의 시나리오를 순수 함수로 옮긴 것.
 * 이름은 비식별본 그대로(마법학교 과목 · 교사NN). 실물 hwp(학교 원본 51반)를 읽던 시험은 합성 표로 갈음한다.
 */
import { describe, expect, it } from 'vitest';
import { applyClassImport, classNameOf, classTemplateCsv, previewClassFile, previewClassTables, subjectOf, type ClassPreview, type ClassSubject } from './classImport';
import { magicFrame } from './magicFrame';
import { csvBytes, hwpBytes, hwpxBytes, xlsxBytes } from './synth';

const frame = magicFrame();
const parse = (csv: string): string[][] => csv.replace(/^﻿/, '').trim().split('\r\n').map((l) => l.split(','));
const ok = (r: ReturnType<typeof previewClassFile>): ClassPreview => { if (!r.ok) throw new Error(r.reason); return r.preview; };
const cls = (p: ClassPreview, n: string) => p.classes.find((c) => c.trackName === n)!;

describe('작은 규칙', () => {
    it('열 머리 → 반, 칸 → 과목', () => {
        expect(classNameOf('3학년 2반')).toBe('3-2');
        expect(classNameOf('3학년2반')).toBe('3-2');
        expect(classNameOf('3-2')).toBe('3-2');
        expect(classNameOf('마법약실1')).toBeNull();
        expect(subjectOf('마법약(전담)')).toBe('마법약');
    });
});

describe('엑셀 양식', () => {
    const csv = classTemplateCsv(frame, [], true);
    const rows = parse(csv);
    const head = rows[0];
    const col = (c: string) => head.indexOf(c);
    const row = (day: string, start: string) => rows.find((x) => x[0] === day && x[1].startsWith(start))!;

    it('반마다 점심·수업 없음·전담 칸이 미리 채워져 있다', () => {
        expect(head.slice(0, 3)).toEqual(['요일', '시각', '교시(1·2 / 3·4 / 5·6학년)']);
        expect(head.length).toBe(3 + 4);
        expect(row('월', '11:30')[col('3-2')]).toBe('점심'); // 3·4학년 점심
        expect(row('월', '12:20')[col('1-1')]).toBe('점심'); // 1·2학년 점심
        expect(row('월', '13:10')[col('1-1')]).toBe('—'); // 1학년 월요일은 4교시까지
        expect(row('월', '09:00')[col('3-2')]).toBe(''); // 담임 칸
        expect(row('월', '09:00')[col('3-4')]).toBe('빗자루비행(전담)');
    });

    it('채워 올리면 담임 칸만 저장하고, 전담 칸을 고친 곳은 어긋남으로 알린다', () => {
        row('월', '09:00')[col('3-2')] = '주문외우기';
        row('월', '12:20')[col('3-2')] = '수비학'; // 3학년 4교시
        row('월', '11:30')[col('3-2')] = '점심'; // 그대로
        row('월', '09:00')[col('3-4')] = '맨드레이크합창(전담)'; // 편성 결과와 다름
        const p = ok(previewClassFile(frame, csvBytes(rows), 'a.csv', []));
        expect(cls(p, '3-2').cells).toEqual([{ dayIndex: 0, start: '09:00', subject: '주문외우기' }, { dayIndex: 0, start: '12:20', subject: '수비학' }]);
        expect(cls(p, '3-2').diff).toEqual({ add: 2, change: 0, remove: 0, same: 0 });
        expect(cls(p, '3-4').mismatches).toEqual([{ dayIndex: 0, start: '09:00', file: '맨드레이크합창', timetable: '빗자루비행' }]);
        expect(cls(p, '3-4').cells).toEqual([]);
        const ap = applyClassImport(frame, [], [{ trackName: '3-2', cells: cls(p, '3-2').cells }]);
        expect(ap.ok && ap.applied).toEqual([{ trackName: '3-2', cells: 2 }]);
        expect(ap.ok && ap.next).toEqual([
            { trackName: '3-2', dayIndex: 0, start: '09:00', subject: '주문외우기' },
            { trackName: '3-2', dayIndex: 0, start: '12:20', subject: '수비학' },
        ]);
        // 다시 내려받으면(지금 저장분이 채워진 양식) 같은 과목이 「같음」으로 잡힌다
        const again = parse(classTemplateCsv(frame, ap.ok ? ap.next : [], false));
        expect(again.find((x) => x[0] === '월' && x[1].startsWith('12:20'))![col('3-2')]).toBe('수비학');
        const p2 = ok(previewClassFile(frame, csvBytes(again), 'a.csv', ap.ok ? ap.next : []));
        expect(cls(p2, '3-2').diff).toEqual({ add: 0, change: 0, remove: 0, same: 2 });
    });

    it('점심 칸에 과목을 적으면 건너뛰고 이유를 보여 준다', () => {
        const p = ok(previewClassFile(frame, new TextEncoder().encode('요일,시각,3-2\r\n월,11:30~12:10,주문외우기\r\n'), 'a.csv', []));
        expect(p.classes[0].skipped).toEqual([{ dayIndex: 0, start: '11:30', text: '주문외우기', why: '그 반 점심 시간' }]);
    });

    it('저장분에 있고 올린 것에 없으면 remove · 바꾸면 change', () => {
        const cur: ClassSubject[] = [
            { trackName: '3-2', dayIndex: 0, start: '09:00', subject: '옛과목' },
            { trackName: '3-2', dayIndex: 1, start: '09:00', subject: '사라질과목' },
        ];
        const p = ok(previewClassFile(frame, new TextEncoder().encode('요일,시각,3-2\r\n월,09:00~09:40,새과목\r\n'), 'a.csv', cur));
        expect(cls(p, '3-2').diff).toEqual({ add: 0, change: 1, remove: 1, same: 0 });
    });
});

// 한글 원본 꼴(학급 표) — 실물 hwp 시험(학교 원본 51반)은 합성 표로 갈음. 열 주인은 반, 줄 머리는 교시 번호.
const D = ['월', '화', '수', '목', '금'];
const gridTable = (): string[][] => {
    const classes = ['3학년 2반', '3학년 4반', '5학년 1반'];
    const title = ['', ...classes.flatMap((c) => D.map(() => c))];
    const days = ['', ...classes.flatMap(() => D)];
    const line = (label: string, byClass: Record<string, string>) => [label, ...classes.flatMap((c) => D.map((_, di) => (di === 0 ? byClass[c] ?? '' : '')))];
    return [
        title, days,
        line('1', { '3학년 2반': '주문외우기', '3학년 4반': '맨드레이크합창(전담)' }),
        line('2', {}),
        line('3', { '5학년 1반': '마법약(전담)' }),
        line('4', { '3학년 2반': '수비학', '5학년 1반': '주문외우기' }),
        line('비고', {}),
    ];
};
// 같은 내용을 양식 꼴로
const templateTable = (): string[][] => {
    const rows = parse(classTemplateCsv(frame, [], true));
    const c = (n: string) => rows[0].indexOf(n);
    const at = (s: string) => rows.find((x) => x[0] === '월' && x[1].startsWith(s))!;
    at('09:00')[c('3-2')] = '주문외우기'; at('09:00')[c('3-4')] = '맨드레이크합창(전담)';
    at('10:40')[c('5-1')] = '마법약(전담)';
    at('12:20')[c('3-2')] = '수비학'; at('11:30')[c('5-1')] = '주문외우기';
    return rows;
};
const expectGridResult = (p: ClassPreview) => {
    expect(cls(p, '3-2').cells).toEqual([{ dayIndex: 0, start: '09:00', subject: '주문외우기' }, { dayIndex: 0, start: '12:20', subject: '수비학' }]); // 3학년 「4」 → 12:20
    expect(cls(p, '5-1').cells).toEqual([{ dayIndex: 0, start: '11:30', subject: '주문외우기' }]); // 5학년 「4」 → 11:30
    expect(cls(p, '3-4').mismatches).toEqual([{ dayIndex: 0, start: '09:00', file: '맨드레이크합창', timetable: '빗자루비행' }]);
    expect(cls(p, '5-1').checked).toBe(1);
    expect(cls(p, '5-1').mismatches).toEqual([]);
    expect(p.unknown).toEqual([]);
};

describe('한글 학급 표 (합성)', () => {
    it('교시는 반마다 자기 학년 시각으로 · 줄 해석 요약 · 전담 칸 대조', () => {
        const r = previewClassTables(frame, [gridTable()], [], 'hwp');
        const p = ok(r);
        expectGridResult(p);
        expect(p.tables).toEqual([{ index: 0, title: '3-2, 3-4, 5-1', classes: 3 }]);
        expect(p.rows.find((x) => x.owner === '3학년' && x.label === '4')).toMatchObject({ start: '12:20', reason: '3학년 시간 틀' });
        expect(p.rows.find((x) => x.owner === '5학년' && x.label === '4')).toMatchObject({ start: '11:30' });
        expect(p.warnings).toEqual([]);
    });
    it('시간표에 없는 반은 unknown (저장 대상 아님)', () => {
        const g = gridTable();
        g[0] = g[0].map((v) => (v === '5학년 1반' ? '6학년 9반' : v));
        const p = ok(previewClassTables(frame, [g], [], 'hwp'));
        expect(p.unknown).toEqual(['6-9']);
        expect(p.classes.map((c) => c.trackName)).toEqual(['3-2', '3-4']);
    });
    it('글자가 있는데 시각을 못 정한 줄은 경고', () => {
        const g = gridTable();
        g.push(['점심시간', '약속', ...Array(14).fill('')]);
        expect(ok(previewClassTables(frame, [g], [], 'hwp')).warnings).toEqual(['3-2 「점심시간」 줄: 시각이나 교시를 알 수 없음']);
    });
    it('학급 표가 아닌 표만 있으면 ❌', () => {
        const r = previewClassTables(frame, [[['과목', '시수'], ['국어', '4']]], [], 'hwpx');
        expect(r).toEqual({ ok: false, reason: '「N학년 N반」 열이 있는 학급 시간표 표를 찾지 못했습니다', warnings: [] });
    });
});

describe('꼴 넷이 같은 결과', () => {
    const viaTemplate = templateTable();
    const viaGrid = gridTable();
    it('csv·xlsx(양식) 와 hwpx·hwp·xlsx(학급 표) 가 모두 같은 반별 결과', () => {
        const csv = ok(previewClassFile(frame, csvBytes(viaTemplate), 'a.csv', []));
        const xlsxT = ok(previewClassFile(frame, xlsxBytes([viaTemplate]), 'a.xlsx', []));
        const hwpx = ok(previewClassFile(frame, hwpxBytes([viaGrid]), 'a.hwpx', []));
        const hwp = ok(previewClassFile(frame, hwpBytes([viaGrid]), 'a.hwp', []));
        const xlsxG = ok(previewClassFile(frame, xlsxBytes([viaGrid]), 'b.xlsx', []));
        expect([csv.source, xlsxT.source, hwpx.source, hwp.source, xlsxG.source]).toEqual(['csv', 'xlsx', 'hwpx', 'hwp', 'xlsx']);
        for (const p of [csv, xlsxT, hwpx, hwp, xlsxG]) expectGridResult(p);
        const strip = (p: ClassPreview) => p.classes.filter((c) => c.trackName !== '1-1').map((c) => ({ ...c }));
        // 학급 표 세 꼴은 그대로 같고, 양식 두 꼴은 양식에 있는 반 하나(1-1·빈 칸)만 더 가진다
        expect(hwp.classes).toEqual(hwpx.classes);
        expect(xlsxG.classes).toEqual(hwpx.classes);
        expect(xlsxT.classes).toEqual(csv.classes);
        expect(strip(csv).map((c) => [c.trackName, c.cells, c.mismatches, c.checked])).toEqual(hwpx.classes.map((c) => [c.trackName, c.cells, c.mismatches, c.checked]));
    });
    it('표 여럿(한글 구역 여럿) — 학급 표가 아닌 표는 넘기고 나머지를 모은다', () => {
        const other = [['과목', '시수'], ['국어', '4']];
        const p = ok(previewClassFile(frame, hwpxBytes([other, viaGrid]), 'a.hwpx', []));
        expectGridResult(p);
        expect(p.tables.map((t) => t.index)).toEqual([1]);
    });
});

describe('깨진 파일 ❌', () => {
    it('깨진 xlsx·hwpx·hwp · 빈 파일 · 바이너리는 던지지 않고 이유를 돌려준다', () => {
        const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);
        const hwpx = new Uint8Array(60); hwpx.set([0x50, 0x4b, 0x03, 0x04]); hwpx.set(new TextEncoder().encode('mimetype'), 30);
        const hwp = new Uint8Array(64); hwp.set([0xd0, 0xcf, 0x11, 0xe0]);
        const cases: [Uint8Array, string, string][] = [
            [zip, 'a.xlsx', 'xlsx 를 읽지 못함'], [hwpx, 'a.hwpx', 'hwpx 를 읽지 못함'], [hwp, 'a.hwp', 'hwp 를 읽지 못함'],
            [new Uint8Array(0), 'a.csv', '알 수 없는 파일 꼴'], [new Uint8Array([1, 0, 2, 3]), 'a.bin', '알 수 없는 파일 꼴'],
        ];
        for (const [bytes, name, why] of cases) {
            const r = previewClassFile(frame, bytes, name, []);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toContain(why);
        }
    });
    it('표가 없는 한글 문서 · 학급 열이 없는 표는 이유가 다르다', () => {
        const r = previewClassFile(frame, csvBytes([['과목', '시수'], ['국어', '4']]), 'a.csv', []);
        expect(r).toMatchObject({ ok: false, reason: '「N학년 N반」 열이 있는 학급 시간표 표를 찾지 못했습니다' });
    });
});

describe('반영', () => {
    const cur: ClassSubject[] = [{ trackName: '3-2', dayIndex: 1, start: '09:00', subject: '옛과목' }, { trackName: '5-1', dayIndex: 0, start: '09:00', subject: '그대로' }];
    it('올린 반만 통째로 바꾸고 나머지 반은 둔다 · 같은 칸 중복은 하나', () => {
        const r = applyClassImport(frame, cur, [{ trackName: '3-2', cells: [{ dayIndex: 0, start: '09:00', subject: '주문외우기' }, { dayIndex: 0, start: '09:00', subject: '중복' }] }]);
        expect(r).toEqual({ ok: true, applied: [{ trackName: '3-2', cells: 1 }], next: [cur[1], { trackName: '3-2', dayIndex: 0, start: '09:00', subject: '주문외우기' }] });
    });
    it('모르는 반 · 잘못된 칸 · 빈 목록이면 아무것도 바꾸지 않고 ❌', () => {
        expect(applyClassImport(frame, cur, [{ trackName: '9-9', cells: [] }])).toEqual({ ok: false, error: '시간표에 없는 반입니다: 9-9' });
        expect(applyClassImport(frame, cur, [{ trackName: '3-2', cells: [{ dayIndex: 7, start: '09:00', subject: '가' }] }]).ok).toBe(false);
        expect(applyClassImport(frame, cur, [{ trackName: '3-2', cells: [{ dayIndex: 0, start: '9시', subject: '가' }] }]).ok).toBe(false);
        expect(applyClassImport(frame, cur, [{ trackName: '3-2', cells: [{ dayIndex: 0, start: '09:00', subject: ' ' }] }]).ok).toBe(false);
        expect(applyClassImport(frame, cur, []).ok).toBe(false);
    });
});

// 학교 원본 hwp(학급 표 여섯 개·51반·1,100칸 넘게)를 읽던 시험은 실물 파일이 있어야 돈다 — 레포엔 합성 표로 갈음했다(위 「한글 학급 표」·「꼴 넷」).
it.skip('학교 원본 hwp 51반 (실물 파일 필요 — 비식별 원본 fixtures 는 레포에 옮기지 않음)', () => {});
