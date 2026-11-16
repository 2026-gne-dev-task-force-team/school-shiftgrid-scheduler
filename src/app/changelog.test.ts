import { describe, it, expect } from 'vitest';
import { parseLog, scrub } from './changelog';

const RAW = [
    'aaa111\t2026-11-16T10:00:00+09:00\tMerge T-10bk(R100): 합침',
    'bbb222\t2026-11-16T09:00:00+09:00\tT-10bk(R100): 보고꾼 시험 — 탭 이름을 한국어로',
    'ccc333\t2026-11-15T09:00:00+09:00\tT-10be: 내 보결 li 중첩 오류 고침',
    'ddd444\t2026-11-14T09:00:00+09:00\t근태: 번호 없는 커밋',
    'eee555\t2026-11-13T09:00:00+09:00\tT-10af·ai: 배지에서 D:/문서/비밀/x.md 열기',
].join('\n');

describe('업데이트 이력 파서', () => {
    const e = parseLog(RAW);
    it('머지·번호 없는 커밋은 빼고 최신순을 지킨다', () => {
        expect(e.map((x) => x.build)).toEqual(['bbb222', 'ccc333', 'eee555']);
    });
    it('태스크·요청 번호와 🐞/🔨 구분', () => {
        expect(e[0]).toMatchObject({ task: 'T-10bk', req: 'R100', kind: 'feat' });
        expect(e[1]).toMatchObject({ task: 'T-10be', req: '', kind: 'fix' });
    });
    it('내부 경로는 가린다', () => {
        expect(e[2].text).not.toContain('D:/');
        expect(scrub('~/x/y 와 /Users/a/b')).not.toMatch(/Users|~\//);
    });
    it('한도를 지킨다', () => {
        expect(parseLog(RAW, 1)).toHaveLength(1);
    });
});
