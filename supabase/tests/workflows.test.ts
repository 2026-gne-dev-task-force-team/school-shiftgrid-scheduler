// T-10e7 — 워크플로 셋(B13·B14·B15)이 시크릿 값을 박지 않고, 정해진 이름만 참조하는지 글자로 잰다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FILES = ['supabase-deploy.yml', 'keepalive.yml', 'backup.yml'];
const read = (n: string) => readFileSync(resolve(ROOT, '.github/workflows', n), 'utf8');

// 설계 ② 8절 + 판 지시의 시크릿 이름 목록
const 허용_시크릿 = [
    'BACKUP_AGE_PUBKEY',
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_ANON_KEY',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_DB_URL',
    'SUPABASE_PROJECT_REF',
];

describe('워크플로 B13·B14·B15', () => {
    it.each(FILES)('%s — 시크릿 값처럼 보이는 문자열 0', (n) => {
        const t = read(n);
        expect(t).not.toMatch(/sbp_/);
        expect(t).not.toMatch(/eyJ/);
        expect(t).not.toMatch(/[A-Za-z0-9+/=_-]{40,}/);
    });

    it.each(FILES)('%s — 들여쓰기 탭 0', (n) => {
        expect(read(n)).not.toMatch(/\t/);
    });

    it('secrets. 참조 이름 목록이 설계 목록과 같다', () => {
        const 쓴 = new Set<string>();
        for (const n of FILES) {
            for (const m of read(n).matchAll(/secrets\.([A-Za-z0-9_]+)/g)) 쓴.add(m[1]);
        }
        expect([...쓴].sort()).toEqual(허용_시크릿);
    });

    it('backup 의 업로드 경로는 .age 로 끝난다', () => {
        const t = read('backup.yml');
        const m = /upload-artifact[\s\S]*?path:\s*(\S+)/.exec(t);
        expect(m).not.toBeNull();
        expect(m![1]).toMatch(/\.age$/);
        expect(t).toMatch(/rm -rf plain/);
    });

    it('backup 은 auth 스키마를 덤프한다', () => {
        expect(read('backup.yml')).toMatch(/--schema public,auth/);
    });

    it.each(FILES)('%s — 시크릿 없음 건너뜀 단계와 ready 게이트가 있다', (n) => {
        const t = read(n);
        expect(t).toMatch(/시크릿 없음 — 건너뜀/);
        expect(t).toMatch(/ready=false/);
        expect(t).toMatch(/steps\.gate\.outputs\.ready == 'true'/);
    });
});
