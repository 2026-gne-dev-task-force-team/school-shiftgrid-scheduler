/**
 * 🔴 약속 「calendar」 0.2(0.1 + registerPreset) — **달력이 남의 일정을 받아 그려 주는 입구**. 달력은 뷰를 빌려주고, 다른 플러그인이
 *   「달력에 맞춘 모양」으로 넣으면 받은 대로 그린다(쥔님 2026-11-08 15:45·16:25).
 *   ⭐ 갈아 끼는 자리: 「출처(CalendarSource)」 하나. 달력은 출처가 무엇을 담는지(남의 분야) 모른다 — 모양만 안다.
 *   ⛔ 분야 낱말 0 · ⛔ contract-clock 에 기대지 않는다(결합을 늘리지 않으려는 판단 — 날짜는 아래 문자열 꼴 하나로).
 *
 *   소비자(남의 일정을 꽂는 쪽): requires/supports { calendar: '^0.1' } + host.modules 로 calendar 를 받아 registerSource(…).
 *   제공자(달력): provides { calendar: '0.2.0' } + modules.calendar. 오늘은 calendar 플러그인이 채운다.
 */
import type { ComponentType } from 'react';
import type { Disposable } from '../../../pane-ui-system/plugin';
import type { IconName } from '../../../pane-ui-system';
import type { RecordField } from '../../collection/contracts/collection';
import type { NodesApi } from '../../explorer/contracts/nodes';

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
    /** 프리셋 하나 등록(0.2) — 해제하면 그 프리셋을 든 저장소는 기본 달력으로 보인다(데이터 그대로). */
    registerPreset(preset: CalendarPreset): Disposable;
    /**
     * 저장소(+자손 저장소) 일정의 회차들 — [from,to) 와 겹치는 것만 · 시작순. 보통 일정 + 반복 일정의 가상 회차 + 실체 회차(가상 자리를 대신).
     *   ⭐ 범위만 계산한다(먼 미래까지 펴지 않는다) · 🔴 부르기만 해서는 노드가 안 생긴다(자동 실체화 ⛔).
     */
    occurrences(storeId: string, from: string, to: string): readonly Occurrence[];
    /** 가상 → 실체 레코드 id(이미 실체면 그 id). 🔴 손댈 때만 부른다. */
    materialize(o: Occurrence): string;
    /** 미루기·당기기 — 실체화 후 옮긴다(originalStart 는 그대로). */
    reschedule(o: Occurrence, start: string, end: string): void;
    /** 그 회차만 빼기 — 규칙의 빠지는 날에 더하고, 실체였으면 그 레코드를 휴지통으로. */
    skip(o: Occurrence): void;
}

/**
 * 회차 하나(0.2) — 날짜는 'YYYY-MM-DDTHH:mm'(종일도 'T00:00' · end 는 반열린 끝).
 *   반복 일정 = `calendar.event` 의 values.when.pattern(옛 data.recur 도 읽는다) · 실체 회차 = `calendar.event` + data.seriesId·data.originalStart.
 */
export interface Occurrence {
    /** 실체면 그 레코드, 가상이면 규칙 일정 id */
    eventId: string;
    /** 규칙 일정 id(반복이 아니면 없음) */
    seriesId?: string;
    /** 규칙상 원래 시작(미뤘으면 start 와 다르다) */
    originalStart?: string;
    start: string;
    end: string;
    allDay: boolean;
    /** 아직 저장 안 된 회차 */
    virtual: boolean;
}

/** 프리셋 저장소를 막 만든 직후 onCreateStore 가 받는 손잡이 — 저장소 data 는 달력만 쓸 수 있어 setStoreData 로 맡긴다. */
export interface PresetCreateContext {
    storeId: string;
    nodes: NodesApi;
    /** 저장소 data 에 patch 를 얕게 합친다(data.preset 은 유지). */
    setStoreData(patch: Record<string, unknown>): void;
}

/** baseFields 함수꼴이 받는 저장소 — 저장소마다 다른 값(예: 방 목록 id)을 data 에서 읽는다. */
export interface PresetStore { id: string; data: Record<string, unknown> }

/**
 * 달력 프리셋(0.2) — 같은 노드 타입(calendar.store·calendar.event)을 쓰되 생긴 것·낱말·첫 화면·미리 깔린 칸만 바꾼다.
 *   저장소 노드 `data.preset` 이 이 id 를 든다. 없거나 못 찾으면 「기본 달력」. ⛔ 프리셋은 보기를 새로 만들지 않는다(고르기만).
 */
export interface CalendarPreset {
    /** '<pluginId>.<name>' */
    id: string;
    label: string;
    icon: IconName;
    /** 낱말 — 저장소·일정·「새 일정」 단추·개수 단위 */
    words: { store: string; event: string; newEvent: string; unit: string };
    /** 기본 칸(제목·언제·메모) 뒤에 미리 깔리는 잠긴 칸 */
    baseFields?: RecordField[] | ((store: PresetStore) => RecordField[]);
    /** 저장소를 열 때 첫 화면 — 'year' | 'month' | 'week' | 'list' … (없으면 보던 그대로) */
    defaultView?: string;
    start?: { description: string; hint: string };
    /** 이 프리셋으로 저장소를 만든 직후 한 번 — 곁에 필요한 노드를 만들고 저장소 data 에 담는다. */
    onCreateStore?(ctx: PresetCreateContext): void | Promise<void>;
}
