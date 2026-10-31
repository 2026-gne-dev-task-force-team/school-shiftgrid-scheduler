/**
 * 구조 검사 — 「반복적으로 색을 줄줄이 박지 말라」를 주석이 아니라 돌아가는 검사로 내린다.
 *   ① features·shell 안에 하드코딩 색 0건 (색은 조각층의 토큰으로만)
 *   ② primitives 가 features·shell 을 import 0건 (층은 아래로만 의존한다)
 *   ③ 호버-숨김(group-hover)은 Row 조각 한 곳에만 — 다른 데 나오면 실패
 *
 * 🔴 이 검사 자체가 정규식 문자열로 금지 패턴을 품고 있으니, 검사 폴더(__tests__)는 스캔 대상에서 뺀다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');

/** dir 아래 .ts/.tsx 파일을 모은다. __tests__ 는 건너뛴다(검사 자신이 금지 문자열을 품는다) */
function walk(dir: string): string[] {
    let out: string[] = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === '__tests__' || e.name === 'node_modules') continue;
            out = out.concat(walk(p));
        } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

const read = (p: string) => readFileSync(p, 'utf-8');

describe('① features·shell 에 하드코딩 색 0건', () => {
    // #rrggbb · rgb( · bg-gray- · text-gray- · border-gray-
    const BANNED = /#[0-9a-fA-F]{3,8}\b|rgb\(|\b(?:bg|text|border)-gray-/;
    const files = [...walk(join(ROOT, 'features')), ...walk(join(ROOT, 'ui', 'shell'))];

    it('스캔할 파일이 실제로 있다(빈 글롭이 거짓 통과를 주지 않게)', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`색 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln: string) => BANNED.test(ln));
            expect(hit, `하드코딩 색이 ${hit + 1}번째 줄에 있다 — 토큰 클래스(bg-panel 등)를 쓴다`).toBe(-1);
        });
    }
});

describe('② primitives 는 features·shell 을 import 하지 않는다 (아래로만 의존)', () => {
    const IMPORT_UP = /from\s+['"][^'"]*(?:\/features\/|\/shell\/|\.\.\/shell|\.\.\/features)[^'"]*['"]/;
    const files = walk(join(ROOT, 'ui', 'primitives'));

    it('스캔할 조각 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`위로 의존 없음: ${basename(f)}`, () => {
            expect(IMPORT_UP.test(read(f)), `${basename(f)} 가 상위 층을 import 한다`).toBe(false);
        });
    }
});

describe('③ 호버-숨김(group-hover)은 Row 조각 한 곳에만', () => {
    // 이 파일 자신이 금지 문자열을 품지 않게 조각으로 조립한다
    const NEEDLE = 'group' + '-hover';
    const files = walk(ROOT).filter((f) => basename(f) !== 'Row.tsx');

    it('Row.tsx 밖에는 group-hover 가 없다', () => {
        const offenders = files.filter((f) => read(f).includes(NEEDLE));
        expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
    });

    it('Row.tsx 에는 실제로 group-hover 가 있다(패턴이 중앙에 산다는 증거)', () => {
        expect(read(join(ROOT, 'ui', 'primitives', 'Row.tsx')).includes(NEEDLE)).toBe(true);
    });
});
