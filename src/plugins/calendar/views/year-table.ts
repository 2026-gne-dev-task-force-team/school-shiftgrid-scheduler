/**
 * year-table — 다이어리 수첩의 연간 계획표를 한 해치 표로 펴는 순수 계산. 🔴 React 0 · 외부 라이브러리 0.
 *   쥔님 2026-11-01: *"연간뷰는 월뷰 작게해서 보이는게 아니라. 그 다이어리 수첩처럼 테이블 형식 같은 느낌으로"*.
 *
 * ⭐ 색·치수를 모른다(그건 뷰의 몫). 여기는 「12달 × 31일 칸에 어느 날이 오나」만 안다.
 *    가로 12열(달) · 세로 31행(일) — 없는 날(2월 30일·4월 31일 등)은 null 이다.
 *   🔴 날짜 계산 사본을 두지 않는다 — isoOf 는 창틀 부품(배럴)에서 가져다 쓴다.
 */
import { isoOf } from '../../../pane-ui-system';

/** 연간표 한 칸 — 한 날. 없는 날 자리는 칸이 아니라 null 이다 */
export interface YearCell {
    y: number;
    /** 1~12 */
    m: number;
    /** 1~31 */
    d: number;
    /** 0=일 ~ 6=토 */
    weekday: number;
    /** today 인자와 같은 날인가. today 를 안 주면 늘 false(결정적) */
    isToday: boolean;
    /** 'YYYY-MM-DD' */
    iso: string;
}

/**
 * year 한 해를 12열(달) × 31행(일) 표로 — cells[m-1][d-1].
 *   없는 날(2월 30일·31일, 4·6·9·11월 31일 등)은 null 로 둔다(수첩 연간표의 빈 칸).
 *   today 를 주면 그 칸의 isToday 가 true(안 주면 전부 false — 결정적).
 */
export function yearTable(year: number, today?: Date): (YearCell | null)[][] {
    const tY = today?.getFullYear();
    const tM = today ? today.getMonth() + 1 : undefined;
    const tD = today?.getDate();

    const cols: (YearCell | null)[][] = [];
    for (let m = 1; m <= 12; m++) {
        const col: (YearCell | null)[] = [];
        for (let d = 1; d <= 31; d++) {
            const dt = new Date(year, m - 1, d);
            // Date 가 넘겨 버렸으면(2월 30일 → 3월) 그 달엔 없는 날이다
            if (dt.getMonth() !== m - 1 || dt.getDate() !== d) {
                col.push(null);
                continue;
            }
            col.push({
                y: year, m, d,
                weekday: dt.getDay(),
                isToday: year === tY && m === tM && d === tD,
                iso: isoOf(year, m, d),
            });
        }
        cols.push(col);
    }
    return cols;
}

/** '2026년' */
export function yearLabel(year: number): string {
    return `${year}년`;
}
