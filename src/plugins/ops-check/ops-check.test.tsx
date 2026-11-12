import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { runCheck } from './run';
import { CheckResult } from './CheckPanel';

// 가짜 v1 문서(코드로 만든다 — 실자료·실명 없음). 51반, 어떤 규칙에도 안 걸린다.
const v1 = (n = 51): any => ({
    meta: { name: '가짜학교', term: '1', schemaVersion: 3 },
    agents: [{ kind: 'agent', id: 'a1', name: '가나다', attr: { 직무: '전담' } }],
    activities: [], resources: [],
    specs: [{ id: 's1', name: '틀1', slots: [{ index: 0, label: '1교시', kind: 'lesson', assignable: true, start: '09:00', end: '09:40' }] }],
    tracks: Array.from({ length: n }, (_, i) => ({ kind: 'track', id: `t${i}`, name: `반${i + 1}`, specId: 's1' })),
    timetables: [{ id: 'tt', name: 'x', specId: 's1', startDate: '2026-03-02', endDate: '2026-07-20', priority: 0 }],
    demands: [], assignments: [],
});
const html = (text: string) => renderToStaticMarkup(h(CheckResult, { view: runCheck(text) }));

describe('ops-check 화면', () => {
    it('51반 v1 문서는 통과 판', () => {
        const out = html(JSON.stringify(v1(51)));
        expect(out).toContain('✅ 통과');
        expect(out).not.toContain('❌');
    });
    it('심은 표본(schemaVersion 2)은 그 규칙 ❌ 와 막는 줄이 보인다', () => {
        const d = v1(); d.meta.schemaVersion = 2;
        const out = html(JSON.stringify(d));
        expect(out).toContain('doc.schema-version');
        expect(out).toContain('막는 규칙');
        expect(out).not.toContain('✅ 통과');
    });
    it('깨진 JSON·빈 파일은 사람 말', () => {
        expect(html('{"a":')).toContain('깨진 파일');
        expect(html('  ')).toContain('빈 파일');
    });
});
