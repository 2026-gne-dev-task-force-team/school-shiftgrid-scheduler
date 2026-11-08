/**
 * ⑦ 달력 경계 — 달력은 남의 분야를 모른다(쥔님 2026-11-08: *"달력은 다른 플러그인을 알 필요도 없고 의존해서도 안 된다"*).
 *   · 달력 폴더(src/plugins/calendar/**)에 분야 낱말 0 — 부재·보결·시간표 등 남의 도메인 어휘가 들어오면 빨강.
 *   · 달력이 import 하는 형제 약속은 자기 입구(contract-calendar)와 노드(contract-nodes)뿐 — 남의 약속은 끌지 않는다.
 *   (구조 검사 ⑱(d·g) 가 「import type 만·contract 폴더에서만」을 이미 보강한다 — 여긴 「어느 약속인가」까지 좁힌다.)
 *   🔴 이 검사 파일 자신이 금지 낱말을 품으니 .test.ts 는 스캔에서 뺀다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'src', 'plugins', 'calendar');

function walk(dir: string): string[] {
    let out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(p));
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
}
const read = (p: string) => readFileSync(p, 'utf-8');
const files = walk(DIR);

describe('⑦ 달력 폴더에 분야 낱말 0', () => {
    const DOMAIN = ['부재', '보결', '시간표', '근태', '교사', 'roster', 'timetable', 'absence', 'personId', 'week-grid'];

    it('스캔할 파일이 실제로 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`분야 낱말 없음: ${f.slice(DIR.length + 1)}`, () => {
            const src = read(f);
            const hit = DOMAIN.filter((w) => src.includes(w));
            expect(hit, `달력에 남의 분야 낱말이 들어왔다: ${hit.join(', ')}`).toEqual([]);
        });
    }
});

describe('달력이 끄는 형제 약속은 contract-calendar·contract-nodes 뿐', () => {
    const ALLOWED = new Set(['contract-calendar', 'contract-nodes']);
    for (const f of files) {
        it(`남의 약속 import 없음: ${f.slice(DIR.length + 1)}`, () => {
            const src = read(f);
            const bad: string[] = [];
            for (const m of src.matchAll(/from\s+['"]\.\.\/(contract-[\w-]+)['"/]/g)) {
                if (!ALLOWED.has(m[1])) bad.push(m[1]);
            }
            expect(bad, `달력이 남의 약속을 끈다(입구는 contract-calendar 하나): ${bad.join(', ')}`).toEqual([]);
        });
    }
});
