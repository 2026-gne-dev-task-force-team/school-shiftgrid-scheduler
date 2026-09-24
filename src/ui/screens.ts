/** 7단계 화면 등록부 — 홈 아이콘 격자와 왼쪽 세로 탭이 이 목록 하나를 그린다 */
import type { ScreenId } from '../store/store';
import type { IconName } from './parts/Icon';

export interface ScreenDef { id: ScreenId; title: string; icon: IconName; desc: string; }

export const SCREENS: ScreenDef[] = [
    { id: 'basic', title: '기초자료', icon: 'table', desc: '학교·시간 틀·반·교사·과목·특별실·시수표를 채웁니다' },
    { id: 'blocks', title: '특별작업', icon: 'ban', desc: '배정금지·회피·임시금지 칸과 고정 수업을 정합니다' },
    { id: 'generate', title: '생성', icon: 'sparkles', desc: '자동 배정으로 후보 여럿을 만들어 하나를 고릅니다' },
    { id: 'diagnose', title: '진단', icon: 'search', desc: '규칙별 문제를 세어 보고 자동으로 조정합니다' },
    { id: 'edit', title: '편집', icon: 'edit', desc: '칸을 두 번 눌러 손으로 옮깁니다' },
    { id: 'boards', title: '판', icon: 'layers', desc: '판을 저장·비교하고 공개본을 고릅니다' },
    { id: 'export', title: '출력', icon: 'printer', desc: '인쇄하고 엑셀·JSON 으로 내보냅니다' },
];
