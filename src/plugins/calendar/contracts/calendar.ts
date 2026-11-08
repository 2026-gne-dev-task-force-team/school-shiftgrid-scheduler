/**
 * 🔴 약속 「calendar」 0.1 — **달력이 남의 일정을 받아 그려 주는 입구**. 달력은 뷰를 빌려주고, 다른 플러그인이
 *   「달력에 맞춘 모양」으로 넣으면 받은 대로 그린다(쥔님 2026-11-08 15:45·16:25).
 *   ⭐ 갈아 끼는 자리: 「출처(CalendarSource)」 하나. 달력은 출처가 무엇을 담는지(남의 분야) 모른다 — 모양만 안다.
 *   ⛔ 분야 낱말 0 · ⛔ contract-clock 에 기대지 않는다(결합을 늘리지 않으려는 판단 — 날짜는 아래 문자열 꼴 하나로).
 *
 *   소비자(남의 일정을 꽂는 쪽): requires/supports { calendar: '^0.1' } + host.modules 로 calendar 를 받아 registerSource(…).
 *   제공자(달력): provides { calendar: '0.1.0' } + modules.calendar. 오늘은 calendar 플러그인이 채운다.
 */
import type { ComponentType } from 'react';
import type { Disposable } from '../../../pane-ui-system/plugin';

/**
 * 달력에 그려 달라고 넘기는 일정 한 칸 — 노드도 뭐도 아닌 **평면 값**이다.
 *   날짜는 달력이 이미 쓰는 'YYYY-MM-DDTHH:mm' 지역 문자열 그대로(종일이면 'YYYY-MM-DD' 도 된다).
 *   color 는 뜻색 토큰 이름('accent'·'ok'·'warn'·'bad'·'accenth')만 — 없으면 달력이 출처 순서로 색을 돌린다.
 */
export interface CalendarItem {
    id: string;
    title: string;
    /** 시작 — 'YYYY-MM-DDTHH:mm'(종일이면 'YYYY-MM-DD' 허용) */
    start: string;
    /** 끝 — 반열린 [start,end). 'YYYY-MM-DDTHH:mm'(종일이면 다음 날 자정) */
    end: string;
    allDay: boolean;
    /** 뜻색 토큰 이름(accent·ok·warn·bad·accenth) · 없으면 출처 순서 색 */
    color?: string;
    memo?: string;
}

/**
 * 「이 일정을 누르면 띄울 편집 화면」 — 달력이 인라인 카드 자리에 그대로 렌더한다.
 *   넣는 플러그인이 자기 뷰를 구현해 출처에 달면, 남의 일정도 **그 자리에서** 편집된다. 없으면 읽기 전용.
 *   ⭐ item 은 눌린 그 일정 · onClose 는 카드를 닫는 손잡이(편집을 마치면 부른다).
 */
export type CalendarItemEditor = ComponentType<{ item: CalendarItem; onClose: () => void }>;

/**
 * 달력에 등록하는 「일정 출처」 하나 — 달력은 이걸 통째로 받아 자기 뷰에 겹쳐 그린다.
 *   · list(from,to) — 그 범위([from,to) · ISO 분 문자열)에 걸치는 일정을 돌려준다. 범위 거르기는 **출처 몫**(달력은 받은 대로 그린다).
 *   · onChange — 담긴 일정이 바뀌면 울린다. 달력이 그때 다시 그린다. 돌려준 Disposable 로 구독을 끊는다.
 *   · editor — 있으면 편집 가능(그 화면을 카드 자리에) · 없으면 읽기 전용.
 */
export interface CalendarSource {
    id: string;
    label: string;
    list(from: string, to: string): readonly CalendarItem[];
    onChange(listener: () => void): Disposable;
    editor?: CalendarItemEditor;
}

/**
 * 달력이 채우는 모듈 — 출처를 하나 등록한다. 돌려준 Disposable 을 해제하면 그 출처와 일정이 사라지고 onChange 구독도 끊긴다.
 *   · parseIcs — .ics 텍스트를 CalendarItem 들로 편다(가져오기·링크 구독이 같이 쓰는 파서). 🔴 구독 플러그인이 달력 내부
 *     파일을 직접 import 하지 않게(꾸러미 경계), 파서는 달력이 이 약속으로 내준다. 못 읽는 VEVENT 는 건너뛴다 · RRULE 은 YEARLY 만 펼친다.
 */
export interface Calendar {
    registerSource(source: CalendarSource): Disposable;
    parseIcs(text: string): CalendarItem[];
}
