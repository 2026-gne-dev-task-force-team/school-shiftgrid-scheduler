import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import config from '../../site.config.json';
import { migrateLegacyKeys } from './site-config';

const SRC = resolve(process.cwd(), 'src');
function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' || (e.name === 'legacy' && dir.endsWith('v1-editor')) ? [] : walk(p);   // legacy = v1 편성기 사본(검사 밖)
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
}

describe('1.2v 구조 — 접두사·설치 목록', () => {
    it('(a) src 에 접두사 리터럴·접두사 안 거친 저장소 키 0 (접두사는 site.config.json 한 곳)', () => {
        const bad: string[] = [];
        for (const f of walk(SRC)) {
            if (f.endsWith('storage.ts') || f.endsWith('site-config.ts')) continue;   // 접두사 조립 자리
            const lines = readFileSync(f, 'utf-8').split('\n');
            lines.forEach((l, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
                const code = l.replace(/\/\/.*$/, '');
                if (/shiftgrid\./.test(code)) bad.push(`${f}:${i + 1} 접두사 리터럴`);
                if (/(?:local|session)Storage\.\w+Item\(\s*['"`]/.test(code)) bad.push(`${f}:${i + 1} 저장소 키 리터럴`);
                if (/indexedDB\.open\(\s*['"`]/.test(code)) bad.push(`${f}:${i + 1} DB 이름 리터럴`);
            });
        }
        expect(bad).toEqual([]);
        expect(config.storagePrefix).toBe('shiftgrid.v1_2');
    });

    it('(b) site.config.json plugins 가 src/plugins/ 폴더와 1:1 (pane-test 는 개발 전용, v1-editor 는 P10 꾸러미 등록 전이라 제외)', () => {
        const dirs = readdirSync(join(SRC, 'plugins'), { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name !== '__tests__' && e.name !== 'pane-test' && e.name !== 'v1-editor').map((e) => e.name).sort();
        expect([...config.plugins].sort()).toEqual(dirs);
        expect(new Set(config.plugins).size).toBe(config.plugins.length);
    });

    it('이전: 옛 키를 새 키로 복사만 하고(옛 키 유지) 새 키는 덮지 않으며 두 번째는 건너뛴다', () => {
        const m = new Map<string, string>();
        const st = { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null,
            getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
        m.set('old.a', '1'); m.set('old.b', '2'); m.set('new.b', 'keep');
        expect(migrateLegacyKeys(st, 'new', ['old'])).toBe(1);
        expect(m.get('new.a')).toBe('1'); expect(m.get('new.b')).toBe('keep'); expect(m.get('old.a')).toBe('1');
        m.set('old.c', '3');
        expect(migrateLegacyKeys(st, 'new', ['old'])).toBe(0);
    });
});
