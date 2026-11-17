// 서버 시계 — 서울(Asia/Seoul) 명시. 함수 런타임엔 TZ 가 없어(② 1절) UTC 로 돈다.
// ⛔ `new Date().toISOString().slice(0,10)`·DB `now()::date`(UTC 자정 = 서울 09:00 에 날이 바뀜).
// ① D2 `_shared/day/today.ts` 가 이 파일을 쓴다. 시계는 주입(Clock) — 시험은 가짜 시계로 08:59/09:00 을 잰다.

export const SEOUL_TZ = 'Asia/Seoul';

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

export interface SeoulParts {
    /** `YYYY-MM-DD` */
    date: string;
    /** 자정부터 분 */
    minute: number;
}

/** 그 순간의 서울 날짜·분 */
export function seoulParts(at: Date): SeoulParts {
    const p: Record<string, string> = {};
    for (const x of fmt.formatToParts(at)) p[x.type] = x.value;
    return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/** 서울 「오늘」 `YYYY-MM-DD` */
export function seoulToday(clock: Clock = systemClock): string {
    return seoulParts(clock()).date;
}

/** `YYYY-MM-DD` 가 서울 오늘보다 앞인가(400 `past_date` 판정 몫 · 오늘은 지난 날이 아니다) */
export function isPastDate(date: string, clock: Clock = systemClock): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 꼴이 아닙니다');
    return date < seoulToday(clock);
}
