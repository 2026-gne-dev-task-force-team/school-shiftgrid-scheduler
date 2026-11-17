/**
 * 「자동 편성 엔진」 플러그인 — 화면 없음. 약속 solver 를 채우기만 한다(1.2v 편성기 분해 F1).
 *   🔴 화면은 엔진을 모른다 — host.modules.use<Solver>('solver') 로만 부른다(설계 2절 3번).
 *   ⛔ 편성 입력 조립(정본 일곱에서 모으기)은 F5 · 규칙 낱개 기여는 F2 몫이다.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { solverApi } from './api';

export const timetableSolverPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { solver: '0.1.0' },
        contributes: {
            interfaces: [{ name: 'solver', version: '0.1.0', label: '자동 편성 엔진', desc: '시간표 자동 편성·겹침 점검·옮기기 판정' }],
        },
    },
    modules: { solver: solverApi },
});

export default timetableSolverPlugin;
