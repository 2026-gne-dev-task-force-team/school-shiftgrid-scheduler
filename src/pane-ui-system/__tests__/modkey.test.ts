/**
 * 수정키 래칫 — 🔴 `.metaKey` 를 platform-keys.ts 밖에서 읽으면 빨개진다(윈도우에서 Win 키를 Mod 로 오인한다 · W14).
 *   맥 ⌘ 판정은 isMod(e) 로만. 허용: KeyInput 에 이벤트 값을 그대로 넘기는 한 줄(`metaKey: e.metaKey`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(p);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
}

describe('수정키 래칫', () => {
    it('.metaKey 는 platform-keys.ts 밖에서 읽지 않는다', () => {
        const bad: string[] = [];
        for (const f of walk(ROOT)) {
            const rel = relative(ROOT, f);
            if (rel.endsWith('platform-keys.ts')) continue;
            readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
                if (/\.metaKey\b/.test(l) && !/metaKey: e\.metaKey/.test(l)) bad.push(`${rel}:${i + 1}  ${l.trim()}`);
            });
        }
        expect(bad, 'isMod(e) 를 쓰세요 — pane-ui-system/platform-keys.ts').toEqual([]);
    });
});
