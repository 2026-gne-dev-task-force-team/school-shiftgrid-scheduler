import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { josa } from '../pane-ui-system/primitives/josa';

/** 시작 화면 안내 문구가 명사+조사를 하드코딩한 자리 — 받침과 조사가 맞는지(「빈 컬렉션가」 사고, V 검수 S6). */
function walk(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out); else if (/StartScreen\.tsx$|config\.ts$/.test(n)) out.push(p);
    }
    return out;
}

describe('시작 화면 안내 문구 조사', () => {
    it('newHint/startHint 의 「빈 X가/이」 조사가 받침에 맞는다', () => {
        let checked = 0;
        for (const f of walk(join(__dirname))) {
            const src = readFileSync(f, 'utf8');
            for (const m of src.matchAll(/(?:newHint="|startHint: ')빈 ([가-힣]+)(?:\([^)]*\))?(이|가)/g)) {
                checked++;
                expect(josa(m[1], '이/가'), `${f}: ${m[0]}`).toBe(m[1] + m[2]);
            }
        }
        expect(checked).toBeGreaterThan(3);
    });
});
