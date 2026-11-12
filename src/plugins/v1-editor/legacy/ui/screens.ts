/** 7단계 화면 등록부 — 홈 아이콘 격자와 왼쪽 세로 탭이 이 목록 하나를 그린다. 이름은 낱말 사전(L)에서 온다 */
import type { ScreenId } from '../store/store';
import type { IconName } from './parts/Icon';
import { L } from './help/terms';

export interface ScreenDef { id: ScreenId; title: string; icon: IconName; desc: string; }

export const SCREENS: ScreenDef[] = [
    { id: 'basic', title: L.screen.basic, icon: 'table', desc: '시간 틀·반·교사·과목·특별실·시수표를 채웁니다.' },
    { id: 'blocks', title: L.screen.blocks, icon: 'ban', desc: '배정 불가·되도록 피함·임시 불가 칸과 고정 수업을 정합니다.' },
    { id: 'generate', title: L.screen.generate, icon: 'sparkles', desc: '시간표 후보 여럿을 만들어 하나를 고릅니다.' },
    { id: 'diagnose', title: L.screen.diagnose, icon: 'search', desc: '규칙별 문제를 세어 보고 자동으로 개선합니다.' },
    { id: 'edit', title: L.screen.edit, icon: 'edit', desc: '칸을 눌러 수업을 손으로 옮깁니다.' },
    { id: 'boards', title: L.screen.boards, icon: 'layers', desc: '시안을 저장·비교하고 확정본을 고릅니다.' },
    { id: 'export', title: L.screen.export, icon: 'printer', desc: '인쇄하고 엑셀·작업 파일로 내보냅니다.' },
];
