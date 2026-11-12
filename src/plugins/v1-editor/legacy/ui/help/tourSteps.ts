/**
 * 코치마크 단계 — 화면 요소(data-tour="…")를 차례로 짚으며 안내한다.
 *   tour    가리킬 요소의 data-tour 값
 *   screen  그 요소가 사는 화면(코치마크가 알아서 옮긴다). 없으면 지금 화면 그대로
 * ⚠️ basic-subtabs·demand-sheet·excel-bar 는 「기초자료」(시트 판)가 붙인다.
 *    아직 없으면 그 단계는 조용히 건너뛴다(코치마크는 죽지 않는다).
 */
import type { ScreenId } from '../../store/store';
import type { DemoId, FigureId } from './rich';

export interface TourStep {
    tour: string;
    screen?: ScreenId;
    /** 대상을 찾기 전에 먼저 눌러야 하는 요소(예: 기초자료의 「시수표」 소절 버튼). 화면 안 소절은 store 가 모른다 */
    pre?: string;
    title: string;
    body: string[];
    /** 사용 예 한 줄 · 정지 그림 · 움직이는 사용법 (v0.3 · 카드가 있으면 그린다) */
    example?: string;
    figure?: FigureId;
    demo?: DemoId;
}

export const TOUR_STEPS: TourStep[] = [
    { tour: 'home-steps', screen: 'home', title: '7단계 흐름',
        body: ['시간표는 이 일곱 단계를 차례로 밟아 완성합니다.', '각 칸에는 어디까지 되었는지 배지가 붙습니다.'],
        example: '예: 기초자료 → 자동 배정 → 인쇄까지 왼쪽 탭을 위에서 아래로 밟습니다.',
        figure: 'flow' },
    { tour: 'basic-subtabs', screen: 'basic', title: '기초자료',
        body: ['먼저 학교의 바탕이 되는 자료를 채웁니다.', '시간 틀·반·교사·과목·특별실을 여기서 만듭니다.'],
        example: '예: 5·6학년 시간 틀을 6교시로 만들고 6-1·6-2·6-3 반을 넣습니다.',
        figure: 'homeroom' },
    { tour: 'demand-sheet', screen: 'basic', pre: '[data-tour="basic-demands"]', title: '시수표',
        body: ['「어느 교사가 어느 반에 무슨 과목을 주 몇 시간」을 적습니다.', '이 표가 자동 배정의 유일한 입력입니다.'],
        example: '예: 가람 · 영어 · 6학년 · 6-1~6-3 · 주 3시간을 적으면 세 줄로 펼쳐집니다.',
        figure: 'demand-row', demo: 'sheet-paste' },
    { tour: 'excel-bar', screen: 'basic', title: '엑셀로 넣기',
        body: ['이미 만든 엑셀 시수표가 있으면 그대로 불러올 수 있습니다.', '빈 서식을 내려받아 채운 뒤 다시 넣어도 됩니다.'],
        example: '예: 「시수표 엑셀 내려받기」로 받은 서식을 채워 「엑셀에서 불러오기」로 넣습니다.',
        figure: 'excel-paste' },
    { tour: 'generate-run', screen: 'generate', title: '자동 배정',
        body: ['시수표를 바탕으로 시간표 후보 여러 장을 자동으로 만듭니다.', '그중 하나를 골라 적용합니다.'],
        example: '예: 「후보 수」 4로 자동 배정하면 필수 위반 0인 「추천」 후보가 나옵니다.',
        figure: 'candidates', demo: 'demand-to-grid' },
    { tour: 'diagnose-table', screen: 'diagnose', title: '점검',
        body: ['규칙을 얼마나 어겼는지 규칙별로 셉니다.', '필수 위반이 0이라야 완성된 시간표입니다.'],
        example: '예: 「같은 반 겹침」 행을 누르면 6-2 목요일 2교시처럼 문제 칸이 열립니다.',
        figure: 'rules-two' },
    { tour: 'edit-grid', screen: 'edit', title: '직접 조정',
        body: ['칸을 눌러 수업을 손으로 옮깁니다.', '옮기기 전에 규칙이 어떻게 바뀌는지 미리 보여 줍니다.'],
        example: '예: 한결 선생님 체육 칸을 누르면 갈 수 있는 칸이 초록으로 켜집니다.',
        figure: 'move-legend', demo: 'move-lesson' },
    { tour: 'boards-save', screen: 'boards', title: '시안',
        body: ['지금 시간표를 이름 붙여 보관합니다.', '여러 시안을 비교해 하나를 확정본으로 정합니다.'],
        example: '예: 「1차 시안」으로 저장하고 「부장 회의 반영」과 견줘 봅니다.',
        figure: 'boards' },
    { tour: 'export-print', screen: 'export', title: '인쇄·내보내기',
        body: ['완성된 시간표를 반별·교사별로 인쇄합니다.', '엑셀이나 작업 파일로도 내보낼 수 있습니다.'],
        example: '예: 「반별」을 골라 6-1·6-2·6-3 반마다 한 장씩 인쇄합니다.',
        figure: 'print-views' },
    { tour: 'feedback-button', title: '의견 보내기',
        body: ['불편한 점이나 바라는 점이 있으면 여기서 바로 보냅니다.', '어느 화면에서 눌렀는지와 캡처가 함께 갑니다.'],
        example: '예: 「자동 배정이 느립니다」를 적고 화면 캡처를 붙여 보냅니다.' },
    { tour: 'topbar-help', title: '도움말은 여기',
        body: ['막히면 언제든 여기를 누르세요.', '이 화면 설명·용어·사용 설명서가 모두 들어 있습니다.'],
        example: '예: 낯선 낱말이 나오면 「용어」 탭에서 뜻과 예를 봅니다.' },
];
