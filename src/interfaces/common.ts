/**
 * 학교 인터페이스들이 같이 쓰는 낱말 — ⚠️ 이 파일은 인터페이스가 아니다(INTERFACES 목록에 없다). 타입만 둔다.
 *   ⛔ 값(const·function) 0 — 구조 검사 ⑱(d): src/plugins 는 src/interfaces 를 import type 으로만 본다.
 *   명세 [[모듈·의존성 요구명세]] M0.5 · 요구 원본 [[김은지 선생님 코드 요구 해부]]
 */
import type { Disposable } from '../pane-ui-system/plugin';

export type { Disposable };

/** 요일 — 1=월 … 5=금(주 5일). 토·일은 1차에 없다. */
export type Weekday = 1 | 2 | 3 | 4 | 5;

/** 하루 안의 시각 — 자정부터 센 분(08:50 = 530). 🔴 충돌 판정은 교시가 아니라 이 값으로 한다(벽시계 모델). */
export type Minute = number;

/** 시각 구간 — [start, end) · 분 단위. */
export interface TimeRange {
    start: Minute;
    end: Minute;
}

/** 날짜 — 'YYYY-MM-DD'(현지 날짜 · 시간대 없음). */
export type IsoDate = string;

/** 교시 칸 하나 — 어느 학년 기준인지는 쓰는 쪽이 안다(같은 「4교시」가 학년마다 다른 시각이다). */
export interface PeriodRef {
    day: Weekday;
    period: number;   // 1부터
}

/** 바뀜 알림 — 인터페이스마다 onChange(fn) 으로 낸다. 받은 Disposable 은 host track 이 거둔다. */
export type Subscribe = (fn: () => void) => Disposable;

/** 가져오기 결과 — 엑셀 업로드 자리(roster.importRows 등). 실패한 줄을 숨기지 않고 돌려준다. */
export interface ImportReport {
    added: number;
    updated: number;
    skipped: { row: number; reason: string }[];
}
