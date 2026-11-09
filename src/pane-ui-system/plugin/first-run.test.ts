/**
 * onFirstRun — 첫 실행 기본 배치가 「조용히 증발」하지 않는지 지킨다.
 *
 * 🔴 왜 이 테스트가 있나 (2026-11-02 실측 사고):
 *   main.tsx 는 React 렌더보다 **먼저** activateAll 을 돌린다. 그때는 작업대 다리(setWorkspaceBridge)가
 *   아직 안 서 있어서 host.workspace.open 이 조용히 null 만 주고 끝났다. 그런데 '__first-run' 플래그는
 *   이미 켜져서, 깨끗한 프로파일에서 **왼쪽 탐색기·오른쪽 작은 달력·가운데 달력이 영영 안 깔렸다.**
 *   겉보기로는 「그냥 빈 창」이라 고장인지 아닌지도 안 갈렸다.
 *
 * ⭐ 재는 것은 셋: ①다리가 선 뒤에 반드시 돈다 ②한 번만 돈다 ③하나가 터져도 남을 안 막는다.
 * ⚠️ 이 레포 테스트 환경은 node 라 localStorage 가 없다 — 메모리 스텁을 끼운다(저장이 이 테스트의 핵심이라 피할 수 없다).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeHost } from './host';
import { disposeOwner, setWorkspaceBridge } from './store';

// ── localStorage 스텁 (node 환경) ──
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

/** '__first-run' 으로 끝나는 키가 켜졌나 — ⛔ 저장 접두사를 짐작해 박지 않는다(prefix 는 앱이 정한다). */
function firstRunFlagSet(owner: string): boolean {
    for (const [k, v] of mem) {
        if (k.includes(owner) && k.endsWith('__first-run') && v === 'true') return true;
    }
    return false;
}

/** 열린 viewId 를 모으는 가짜 다리 */
function bridgeCollecting(into: string[]) {
    return {
        open: (viewId: string) => { into.push(viewId); return viewId; },
        close: () => { },
        setTitle: () => { },
    };
}

const OWNER = 'first-run-t';

beforeEach(() => { disposeOwner(OWNER); setWorkspaceBridge(null); mem.clear(); });

describe('onFirstRun — 다리보다 먼저 불려도 안 사라진다', () => {
    it('다리가 없을 때 등록하면 미뤄 두었다가, 다리가 서는 순간 돈다', () => {
        const h = makeHost(OWNER);
        const opened: string[] = [];

        // activateAll 시점 — 다리 없음
        h.onFirstRun(() => { h.workspace.open('calendar.month', { where: 'center' }); });
        expect(opened).toEqual([]);                  // 아직 안 돈다
        expect(firstRunFlagSet(OWNER)).toBe(false);  // ⭐ 플래그도 아직 안 켜진다 — 여기가 옛 버그 자리

        // Workbench 마운트 — 다리가 선다
        setWorkspaceBridge(bridgeCollecting(opened));
        expect(opened).toEqual(['calendar.month']);
        expect(firstRunFlagSet(OWNER)).toBe(true);
    });

    it('다리가 이미 서 있으면 그 자리에서 바로 돈다', () => {
        const opened: string[] = [];
        setWorkspaceBridge(bridgeCollecting(opened));
        const h = makeHost(OWNER);

        h.onFirstRun(() => { h.workspace.open('explorer.tree', { where: 'left' }); });
        expect(opened).toEqual(['explorer.tree']);
    });

    it('두 번째 실행에는 안 돈다 — 저장된 배치를 덮지 않는다', () => {
        const h1 = makeHost(OWNER);
        const opened: string[] = [];
        h1.onFirstRun(() => { h1.workspace.open('calendar.mini', { where: 'right' }); });
        setWorkspaceBridge(bridgeCollecting(opened));
        expect(opened).toEqual(['calendar.mini']);

        // 다음 번 앱 실행 — 플래그는 저장소에 남아 있다(mem 을 안 지운다)
        disposeOwner(OWNER);
        setWorkspaceBridge(null);
        const h2 = makeHost(OWNER);
        const opened2: string[] = [];
        h2.onFirstRun(() => { h2.workspace.open('calendar.mini', { where: 'right' }); });
        setWorkspaceBridge(bridgeCollecting(opened2));
        expect(opened2).toEqual([]);
    });

    it('콜백이 터져도 다른 플러그인의 첫 실행을 안 막는다', () => {
        const bad = makeHost('bad-t');
        const good = makeHost('good-t');
        const opened: string[] = [];

        bad.onFirstRun(() => { throw new Error('터짐'); });
        good.onFirstRun(() => { good.workspace.open('good.view', { where: 'center' }); });

        expect(() => setWorkspaceBridge(bridgeCollecting(opened))).not.toThrow();
        expect(opened).toEqual(['good.view']);
        disposeOwner('bad-t'); disposeOwner('good-t');
    });
});
