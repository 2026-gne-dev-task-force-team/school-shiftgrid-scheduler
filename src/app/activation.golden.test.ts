/**
 * 🔴 골든 — 실제 PLUGINS 셋의 「활성 순서 + onFirstRun open 호출 순서」를 리팩토링 **전에** 박는다.
 *
 * 왜(명세 M0 「각 단계에서 죽는 방식」): 의존 순서가 바뀌며 지금 넷(설정·탐색기·달력)의 첫 실행 배치가
 *   증발하는 사고(11-02 ad43f55)와 같은 뿌리다. 모듈·의존성(provides/requires/supports·위상 정렬)을
 *   얹기 전에 **지금 순서 그대로** 못 박아, 리팩토링이 배치를 흔들면 여기서 빨간불이 켜진다.
 *
 * ⭐ 재는 것 둘:
 *   ① 활성 순서 — 코어(settings·contract-nodes·project-explorer) 먼저, 그 뒤 목록 순(calendar). onActivate 가 도는 차례.
 *   ② onFirstRun 이 다리가 선 뒤에 여는 viewId 순서 — project-explorer.tree → calendar.month → calendar.mini.
 *      (약속 플러그인 contract-nodes 는 화면·onFirstRun 이 없어 여는 순서에 안 낀다.)
 * ⚠️ node 라 localStorage 가 없다 — first-run.test 와 같은 메모리 스텁(깨끗한 프로파일 = 첫 실행).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activateAll, listPlugins } from '../pane-ui-system/plugin';
import { setWorkspaceBridge } from '../pane-ui-system/plugin';
import { PLUGINS } from './plugins';
// 🔴 2026-11-08 달력 뷰 빌려주기 — calendar 가 provides.calendar 를 선언하면서 그 약속을 선언하는 contract-calendar 가
//    있어야 막히지 않는다. ⚠️ app/plugins.ts 에 contractCalendarPlugin 을 **끝에** 더하는 것이 메인 몫(이 세션은 plugins.ts 를
//    안 건드린다). 그 전까지 이 골든은 「붙였을 때」를 모델링한다 — 메인이 PLUGINS 끝에 더하면 아래 activateAll 을
//    activateAll(PLUGINS) 로 되돌려도 결과가 같다(해소 순서 끝에 contract-calendar).
import { contractCalendarPlugin } from '../plugins/contract-calendar';

/** PLUGINS + 달력 약속(메인이 plugins.ts 끝에 더할 것 — 지금은 테스트용 목록으로 모델링). */
const PLUGINS_WITH_CALENDAR_CONTRACT = [...PLUGINS, contractCalendarPlugin];

// ── localStorage 스텁 (node 환경 · 깨끗한 프로파일) ──
const mem = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
            setItem: (k: string, v: string) => { mem.set(k, String(v)); },
            removeItem: (k: string) => { mem.delete(k); },
            clear: () => { mem.clear(); },
            key: (i: number) => [...mem.keys()][i] ?? null,
            get length() { return mem.size; },
        },
    });
}

function bridgeCollecting(into: string[]) {
    return { open: (viewId: string) => { into.push(viewId); return viewId; }, close: () => { } };
}

beforeEach(() => { setWorkspaceBridge(null); mem.clear(); });

describe('골든 — 실제 PLUGINS 활성·첫 실행 배치 순서(리팩토링 전 고정)', () => {
    it('셋 다 활성되고(실패 0) 끄지 않았다', () => {
        activateAll(PLUGINS_WITH_CALENDAR_CONTRACT);
        const ps = listPlugins();
        expect(ps.map((p) => p.id)).toEqual([
            'settings', 'contract-nodes', 'project-explorer', 'calendar',
            // 🔴 계정(2026-11-08 머지) — 약속 셋이 제공자(account·credential-local)보다 앞에 선다.
            'contract-identity', 'contract-credential', 'contract-permit', 'account', 'credential-local',
            // 🔴 달력 약속(2026-11-08) — 해소 순서 끝에 붙는다(calendar 가 provides 로 쓰는 쪽이라 뒤여도 약속은 선다).
            'contract-calendar',
        ]);
        expect(ps.every((p) => p.enabled)).toBe(true);
        expect(ps.some((p) => p.failed)).toBe(false);
        expect(ps.some((p) => p.blocked)).toBe(false);
    });

    it('onFirstRun 이 다리가 선 뒤 여는 순서: 탐색기 트리 → 달력 월 → 작은 달력', () => {
        activateAll(PLUGINS_WITH_CALENDAR_CONTRACT);
        const opened: string[] = [];
        setWorkspaceBridge(bridgeCollecting(opened));
        expect(opened).toEqual(['project-explorer.tree', 'calendar.month', 'calendar.mini']);
    });
});
