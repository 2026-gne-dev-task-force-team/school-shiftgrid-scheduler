import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { blankWorkbook, parseDemandsWorkbook } from './excel';
import { sampleDoc } from './sample';

/** 시수표 한 시트짜리 엑셀 바이트 (불러오기 테스트용) */
function demandBook(header: string[], ...rows: (string | number)[][]): Uint8Array {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), '시수표');
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('excel 시수표 입출력 — 진도 맞춤 · 전체 펼침', () => {
    it('① 내려받기 머리글 마지막 칸이 「진도 맞춤」', () => {
        const bytes = blankWorkbook(sampleDoc());
        const wb = XLSX.read(bytes, { type: 'array' });
        const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['시수표'], { header: 1 });
        const header = aoa[0];
        expect(header[header.length - 1]).toBe('진도 맞춤');
    });

    it('② 옛 머리글 「차시 순서 맞춤」 열의 Y 를 cycle=true 로 읽는다', () => {
        const doc = sampleDoc();
        const bytes = demandBook(
            ['교사', '과목', '학년', '반', '주당 시수', '차시 순서 맞춤'],
            ['이든', '영어', 3, '1', 3, 'Y'],
        );
        const res = parseDemandsWorkbook(bytes, doc);
        expect(res.errors).toEqual([]);
        expect(res.demands).toHaveLength(1);
        expect(res.demands[0].cycle).toBe(true);
    });

    it('③ 반 칸 「전체」 는 그 학년 반 전부로 펼쳐진다', () => {
        const doc = sampleDoc();
        const grade = 3;
        const nTracks = doc.tracks.filter((t) => t.grade === grade).length;
        expect(nTracks).toBeGreaterThan(1);
        const bytes = demandBook(
            ['교사', '과목', '학년', '반', '주당 시수'],
            ['이든', '영어', grade, '전체', 3],
        );
        const res = parseDemandsWorkbook(bytes, doc);
        expect(res.errors).toEqual([]);
        expect(res.demands).toHaveLength(nTracks);
    });
});
