/**
 * 풍부한 도움말 계약 (v0.3 · 2026-09-30) — ⓘ·용어·화면 도움말·코치마크·설명서가 전부 이 모양으로 말한다.
 *
 *  네 칸 구조: 개념(what) · 그림(figure) · 사용 예(example) · 고치는 곳/다음(fix).
 *  움직이는 사용법(demo)은 「이 조작을 하면 화면이 이렇게 바뀐다」를 4~6장면으로 보여 준다.
 *
 *  ⛔ 이 파일은 타입과 id 목록만 갖는다. 글은 richContent.ts · terms.ts · content.ts, 그림은 figures/, 움직임은 demos/ 에 산다.
 *  ⛔ id 를 늘리려면 여기 union 에 먼저 넣고 세 자리(글·그림·움직임)를 같이 채운다 — 한 곳만 채우면 빈 그림이 뜬다.
 */

/** 정지 그림 — figures/Figure.tsx 가 id 마다 인라인 SVG 를 그린다(색은 CSS 변수 · 외부 파일 0) */
export type FigureId =
    | 'flow'            // 시수표 → 자동 배정 → 시간표 (전체 흐름)
    | 'demand-row'      // 시수표 한 줄이 시간표 몇 칸이 되나 (교사·과목·학년·반·주 3시간 → 3칸)
    | 'homeroom'        // 담임은 반의 속성 — 전담 칸 빼고 남은 빈 칸이 전부 담임 수업
    | 'spec-day'        // 시간 틀 — 학년마다 교시 수·점심 시각이 다르다(1·2학년 5교시 / 5·6학년 6교시). 3교시가 다른 시각
    | 'remaining'       // 배정/필요 — 0/3 남음 3 · 2/3 남음 1 · 3/3 완료 · 4/3 초과 1
    | 'block-states'    // 배정 불가(진한 빗금) · 되도록 피함(연한 점) · 임시 불가(점선)
    | 'fixed-lesson'    // 고정 수업 — 창체가 반의 칸을 미리 차지
    | 'move-legend'     // 직접 조정 색 범례 — 초록 옮길 수 있음 · 노랑 권장 점수 증가 · 빨강 필수 위반
    | 'candidates'      // 시간표 후보 카드 3장 — 필수 위반·권장 점수·추천 배지
    | 'rules-two'       // 필수 규칙(벽) vs 권장 규칙(경사)
    | 'boards'          // 시안 여러 장과 확정본 도장
    | 'print-views'     // 반별·교사별·특별실별 세 표
    | 'status-bar'      // 상태줄 읽는 법 — 🔴 필수 위반 3건 · 권장 점수 · 배정 12/30
    | 'co-teach'        // 함께 수업 — 한 칸에 두 이름
    | 'block-lessons'   // 연속 수업 「2」 — 같은 날 붙은 두 칸
    | 'cycle-order'     // 차시 순서 맞춤 — 1반·2반·3반 1차시 다 끝난 뒤 2차시
    | 'capacity'        // 수용 수 — 과학실 2 → 같은 시각 두 반까지
    | 'pin'             // 잠금 — 📌 붙은 칸은 자동 배정이 안 옮긴다
    | 'work-file'       // 작업 파일(.shiftgrid.json) 하나에 자료·시간표·시안 전부
    | 'excel-paste';    // 엑셀 표 → 시수표에 붙이기(열 순서 같음)

/** 움직이는 사용법 — demos/Demo.tsx 가 id 마다 장면(scene) 배열을 CSS 애니메이션으로 재생한다 */
export type DemoId =
    | 'move-lesson'     // 직접 조정: 칸 선택 → 갈 수 있는 칸 색 → 목적 칸 선택 → 미리보기 → 이동
    | 'block-cycle'     // 고정·금지: 같은 칸을 누를 때마다 없음 → 배정 불가 → 되도록 피함 → 임시 불가 → 없음
    | 'demand-to-grid'  // 자동 배정: 시수표 줄들이 격자로 날아가 채워진다 · 남음이 0 이 된다
    | 'pick-candidate'  // 자동 배정: 후보 3장 중 추천 배지 → 「이 후보로 진행」 → 시간표 적용
    | 'homeroom-fill'   // 담임: 전담 수업이 놓이고 남은 빈 칸에 「담임」이 차오른다
    | 'sheet-paste'     // 시수표: 엑셀 범위 복사 → 시수표 첫 칸 선택 → Ctrl+V → 여러 줄이 한 번에
    | 'save-board'      // 시안: 이름 적기 → 「시안 저장」 → 목록에 카드 → 「확정본으로 지정」 도장
    | 'spec-time'       // 시간 틀: 두 학년의 교시 막대가 나란히 — 같은 3교시가 다른 시각에 · 겹침은 시각으로 판정
    | 'co-teach'        // 함께 수업: 둘째 교사 고르기 → 두 교사 모두 비는 칸에만 배정
    | 'block-move'      // 연속 수업: 붙은 두 칸이 한 덩어리로 움직인다 · 점심을 못 넘는다
    | 'diagnose-fix'    // 점검: 규칙 행 누르기 → 위반 목록 → 직접 조정으로 건너가 칸 강조 → 「자동 개선」으로 숫자 줄어듦
    | 'print-export';   // 인쇄·내보내기: 보기 전환(반별→교사별) → 「인쇄」 → 흑백 표 미리보기

/** 풍부한 도움말 한 덩이 — ⓘ 팝오버·용어 카드·화면 탭·코치마크 카드가 이걸 그린다 */
export interface RichHelp {
    /** 제목(팝오버 머리). 없으면 안 그린다 */
    title?: string;
    /** 개념 — 이것이 무엇인가. 한두 문장 */
    what: string;
    /** 왜 보나 / 왜 이렇게 설계됐나. 한 문장 */
    why?: string;
    /** 사용 예 — 구체 값이 들어간 예. 여러 개면 줄마다 하나 */
    example?: string | string[];
    /** 고치는 곳 · 다음에 할 일. 한 문장 */
    fix?: string;
    /** 정지 그림 */
    figure?: FigureId;
    /** 움직이는 사용법 */
    demo?: DemoId;
    /** 관련 용어(GLOSSARY id) — 팝오버 바닥에 칩으로 */
    terms?: string[];
}

/** ⓘ 자리 열쇠 — 화면 13곳이 richContent.ts 의 RICH[key] 를 집는다 */
export type InfoKey =
    | 'statusBar'         // Shell 상태줄
    | 'export'            // 인쇄·내보내기
    | 'generate'          // 자동 배정
    | 'edit'              // 직접 조정
    | 'demandTable'       // 시수표
    | 'demandStatus'      // 배정/필요 (오른쪽 열 — 툴팁이 잘리던 자리)
    | 'diagnose'          // 점검
    | 'boards'            // 시안
    | 'blocks'            // 고정·금지
    | 'specForm'          // 시간 틀 폼
    | 'specGrades'        // 시간 틀 적용 학년
    | 'specPerDay'        // 요일별 교시 수
    | 'sheetTracks'       // 반 시트
    | 'sheetAgents'       // 교사 시트
    | 'sheetActivities'   // 과목 시트
    | 'sheetResources';   // 특별실 시트

/** 움직이는 사용법 목록(도움말 「사용법」 탭이 이 순서로 그린다) — 제목·한 줄 설명은 richContent.ts 의 DEMOS 가 갖는다 */
export const DEMO_IDS: DemoId[] = [
    'demand-to-grid', 'homeroom-fill', 'sheet-paste', 'spec-time', 'block-cycle',
    'pick-candidate', 'diagnose-fix', 'move-lesson', 'block-move', 'co-teach', 'save-board', 'print-export',
];

export const FIGURE_IDS: FigureId[] = [
    'flow', 'demand-row', 'homeroom', 'spec-day', 'remaining', 'block-states', 'fixed-lesson', 'move-legend',
    'candidates', 'rules-two', 'boards', 'print-views', 'status-bar', 'co-teach', 'block-lessons', 'cycle-order',
    'capacity', 'pin', 'work-file', 'excel-paste',
];
