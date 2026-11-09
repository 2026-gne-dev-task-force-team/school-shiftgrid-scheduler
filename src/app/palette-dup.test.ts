/**
 * 명령 팔레트 — 팔레트에 보이는 라벨은 겹치지 않는다(fix-a 7). 같은 일을 하는 명령은 palette:false 로 하나만 남기고,
 * 다른 일을 하면 라벨을 구별한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activateAll, listCommands, setWorkspaceBridge } from '../pane-ui-system/plugin';
import { PLUGINS } from './plugins';

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
beforeEach(() => { setWorkspaceBridge(null); mem.clear(); });

describe('명령 팔레트 라벨', () => {
    it('팔레트에 보이는 라벨 중복 0', () => {
        activateAll(PLUGINS);
        const shown = listCommands().filter((c) => c.palette !== false);
        if (process.env.DUMP_PALETTE) console.log(shown.map((c) => `${c.title}\t${c.id}`).join('\n'));
        const by = new Map<string, string[]>();
        for (const c of shown) by.set(c.title, [...(by.get(c.title) ?? []), c.id]);
        const dup = [...by].filter(([, ids]) => ids.length > 1).map(([t, ids]) => `${t}: ${ids.join(', ')}`);
        expect(dup).toEqual([]);
        // 괄호 꼬리(「(탐색기)」)·앞 수식만 다른 「같은 일」 짝도 막는다 — 라벨 뒤 괄호를 떼거나 한쪽이 다른 쪽의 꼬리면 겹침으로 본다
        const titles = shown.map((c) => c.title);
        const near = titles.flatMap((a) => titles.filter((b) => a !== b && (a.replace(/\(.*\)$/, '') === b || b.endsWith(' ' + a) && /열기$/.test(a))).map((b) => `${a} ~ ${b}`));
        expect(near).toEqual([]);
    });
});
