/**
 * ══════════════════════════════════════════════════════════════
 *  유도 뷰(Derived) — 저장 모델에서 '계산해낸' 읽기용 구조
 * ══════════════════════════════════════════════════════════════
 *
 * schema.ts가 '저장하는 형태'(최소·정규화·id 참조)라면, 이 파일은 그것을
 * 읽기·검증·필터에 편하도록 '펼쳐 놓은' 형태다.
 *
 *     저장 모델(schema)  ──계산──▶  유도 뷰(derived)
 *     최소 · id 참조                 조인 · 색인 · 읽기에 최적
 *
 * 여기 있는 것은 전부 저장 모델에서 순수하게 파생된다. 그래서 저장하지 않고
 * 필요할 때 만든다. 만드는 비용이 아까우면 캐시(메모이즈)해 두고, 저장 모델이
 * 바뀌면 다시 계산한다. (그래서 '캐시 뷰'라고도 부른다.)
 *
 * ※ 여기엔 '모양(타입)'만 둔다. 실제로 저장 모델에서 이걸 만들어내는 계산
 *    로직은 로직 레이어(helper)에서 담당한다.
 * ══════════════════════════════════════════════════════════════
 */

import type {
    Agent,
    Track,
    Resource,
    Activity,
    Assignment,
    Slot,
} from './schema';

/**
 * Indexes — id로 항목을 즉시 찾기 위한 색인(조회표).
 * 저장 모델은 배열이라 항목 하나 찾으려면 매번 훑어야 하지만, 이 색인이 있으면
 * id → 객체를 한 번에 찾는다. 조인·검증의 바탕이 된다.
 */
export interface Indexes {
    agents: Map<string, Agent>;
    tracks: Map<string, Track>;
    resources: Map<string, Resource>;
    activities: Map<string, Activity>;
}

/**
 * ResolvedAssignment — 배치의 id 참조를 '실제 객체로 풀어놓은' 형태.
 * 저장형 Assignment는 agentId·activityId처럼 id만 갖지만, 화면 표시와 검증은
 * 실제 Agent·Activity 객체가 필요하다. 그 조인을 미리 해 둔 것.
 */
export interface ResolvedAssignment {
    source: Assignment;  // 원본(저장형) 배치
    track: Track;        // trackId를 푼 것
    slot: Slot;          // slotIndex를 푼 것
    agent?: Agent;       // agentId를 푼 것 (배치에 없으면 생략)
    activity?: Activity;  // activityId를 푼 것
    resource?: Resource;  // resourceId를 푼 것
}

/**
 * GridView — 한 시간표의 배치들을 (Track × 날 × 칸) 위치로 꽂아둔 격자.
 * "화요일 3교시 3반 칸에 뭐가 있나?"를 전체 훑기 없이 바로 찾게 해준다.
 * 중복 검사와 화면 렌더의 바탕. cellKey는 `${trackId}:${dayIndex}:${slotIndex}` 규칙.
 */
export interface GridView {
    cells: Map<string, ResolvedAssignment[]>; // cellKey → 그 칸의 배치들 (한 칸에 여러 개 가능)
}
