// T-10dr 재발 방지 — Deno 는 확장자 없는 상대 import 를 못 푼다.
// supabase/functions 에서 닿는 모든 파일(shared/ 포함)의 상대 import 가 확장자를 갖는지 정적으로 잰다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FUNCTIONS = resolve(ROOT, 'supabase/functions');
const EXT = /\.(ts|js|mjs|json)$/;

// import/export ... from '상대경로' · import '상대경로' · import('상대경로')
const IMPORT_RE =
  /(?:import|export)\s[^;'"]*?from\s*['"](\.{1,2}\/[^'"]*)['"]|import\s*['"](\.{1,2}\/[^'"]*)['"]|import\(\s*['"](\.{1,2}\/[^'"]*)['"]\s*\)/g;

function listTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = resolve(dir, e.name);
    return e.isDirectory() ? listTs(p) : e.name.endsWith('.ts') ? [p] : [];
  });
}

/** 상대 import 문자열을 모아 돌려준다. */
function relImports(src: string): string[] {
  return [...src.matchAll(IMPORT_RE)].map((m) => (m[1] ?? m[2] ?? m[3]) as string);
}

function reach(): { files: Set<string>; bad: string[] } {
  const files = new Set<string>();
  const bad: string[] = [];
  const walk = (f: string): void => {
    if (files.has(f)) return;
    files.add(f);
    for (const s of relImports(readFileSync(f, 'utf8'))) {
      if (!EXT.test(s)) bad.push(`${relative(ROOT, f)} → ${s}`);
      const target = resolve(dirname(f), s);
      if (EXT.test(s) && existsSync(target) && statSync(target).isFile() && target.endsWith('.ts')) walk(target);
      else if (EXT.test(s) && !existsSync(target)) bad.push(`${relative(ROOT, f)} → ${s} (없는 파일)`);
    }
  };
  for (const f of listTs(FUNCTIONS)) walk(f);
  return { files, bad };
}

describe('Deno 상대 import 확장자', () => {
  it('정규식이 확장자 없는 줄을 잡는다', () => {
    expect(relImports("import type { A } from './x'")).toEqual(['./x']);
    expect(relImports("import {\n a,\n} from '../y.ts'")).toEqual(['../y.ts']);
    expect(relImports("export * from './z'")).toEqual(['./z']);
  });

  it('supabase/functions 에서 닿는 파일이 shared/ 까지 포함한다', () => {
    const { files } = reach();
    expect([...files].some((f) => f.split(sep).join('/').endsWith('/shared/sub-engine/candidates.ts'))).toBe(true);
  });

  it('닿는 모든 파일의 상대 import 가 확장자(.ts/.js/.mjs/.json)를 갖는다', () => {
    expect(reach().bad).toEqual([]);
  });
});
