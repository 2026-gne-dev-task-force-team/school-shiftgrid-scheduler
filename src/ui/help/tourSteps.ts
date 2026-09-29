/**
 * 코치마크 단계 — 화면 요소(data-tour="…")를 차례로 짚으며 안내한다.
 *   tour    가리킬 요소의 data-tour 값
 *   screen  그 요소가 사는 화면(코치마크가 알아서 옮긴다). 없으면 지금 화면 그대로
 * ⚠️ basic-subtabs·demand-sheet·excel-bar 는 「기초자료」(시트 판)가 붙인다.
 *    아직 없으면 그 단계는 조용히 건너뛴다(코치마크는 죽지 않는다).
 */
import type { ScreenId } from '../../store/store';

export interface TourStep {
    tour: string;
    screen?: ScreenId;
    /** 대상을 찾기 전에 먼저 눌러야 하는 요소(예: 기초자료의 「시수표」 소절 버튼). 화면 안 소절은 store 가 모른다 */
    pre?: string;
    title: string;
    body: string[];
}

export const TOUR_STEPS: TourStep[] = [
    { tour: 'home-steps', screen: 'home', title: '7단계 흐름',
        body: ['시간표는 이 일곱 단계를 차례로 밟아 완성합니다.', '각 칸에는 어디까지 되었는지 배지가 붙습니다.'] },
    { tour: 'basic-subtabs', screen: 'basic', title: '기초자료',
        body: ['먼저 학교의 바탕이 되는 자료를 채웁니다.', '시간 틀·반·교사·과목·특별실을 여기서 만듭니다.'] },
    { tour: 'demand-sheet', screen: 'basic', pre: '[data-tour="basic-demands"]', title: '시수표',
        body: ['「어느 교사가 어느 반에 무슨 과목을 주 몇 시간」을 적습니다.', '이 표가 자동 배정의 유일한 입력입니다.'] },
    { tour: 'excel-bar', screen: 'basic', title: '엑셀로 넣기',
        body: ['이미 만든 엑셀 시수표가 있으면 그대로 불러올 수 있습니다.', '빈 서식을 내려받아 채운 뒤 다시 넣어도 됩니다.'] },
    { tour: 'generate-run', screen: 'generate', title: '자동 배정',
        body: ['시수표를 바탕으로 시간표 후보 여러 장을 자동으로 만듭니다.', '그중 하나를 골라 적용합니다.'] },
    { tour: 'diagnose-table', screen: 'diagnose', title: '점검',
        body: ['규칙을 얼마나 어겼는지 규칙별로 셉니다.', '필수 위반이 0이라야 완성된 시간표입니다.'] },
    { tour: 'edit-grid', screen: 'edit', title: '직접 조정',
        body: ['칸을 눌러 수업을 손으로 옮깁니다.', '옮기기 전에 규칙이 어떻게 바뀌는지 미리 보여 줍니다.'] },
    { tour: 'boards-save', screen: 'boards', title: '시안',
        body: ['지금 시간표를 이름 붙여 보관합니다.', '여러 시안을 비교해 하나를 확정본으로 정합니다.'] },
    { tour: 'export-print', screen: 'export', title: '인쇄·내보내기',
        body: ['완성된 시간표를 반별·교사별로 인쇄합니다.', '엑셀이나 작업 파일로도 내보낼 수 있습니다.'] },
    { tour: 'feedback-button', title: '의견 보내기',
        body: ['불편한 점이나 바라는 점이 있으면 여기서 바로 보냅니다.', '어느 화면에서 눌렀는지와 캡처가 함께 갑니다.'] },
    { tour: 'topbar-help', title: '도움말은 여기',
        body: ['막히면 언제든 여기를 누르세요.', '이 화면 설명·용어·사용 설명서가 모두 들어 있습니다.'] },
];
