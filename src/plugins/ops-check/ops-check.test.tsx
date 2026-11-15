import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { runCheck, isBundleText } from './run';
import { plainText } from './plain';
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
        expect(out).toContain('시간표 자료 형식(판 3)이 아닙니다');
        expect(out).not.toContain('>doc.schema-version<');
        expect(out).toContain('막는 규칙');
        expect(out).not.toContain('✅ 통과');
    });
    it('깨진 JSON·빈 파일은 사람 말', () => {
        expect(html('{"a":')).toContain('깨진 파일');
        expect(html('  ')).toContain('빈 파일');
    });
});

describe('쉬운 말', () => {
    it('엉뚱한 JSON — 규칙 코드·경로 숨김, 없음 줄은 그 밖에 n건', () => {
        const out = html('{"x":1}');
        expect(out).toContain('그 밖에 8건');
        expect(out).not.toContain('>doc/agents<');
        expect(out).not.toContain('필수 배열');
    });
    it('판 3 인데 배열 하나 없으면 한국어 이름', () => {
        const d = v1(); delete d.agents;
        const out = html(JSON.stringify(d));
        expect(out).toContain('선생님 목록이 없습니다');
        expect(plainText({ id: 'doc.array-missing', severity: 'error', where: 'doc/zzz', message: '' })).toBe('zzz이 없습니다.');
    });
});

describe('번들 판정(「이 번들로 쓰기」 버튼 조건)', () => {
    it('번들만 true — v1·깨진·빈 파일은 false', () => {
        expect(isBundleText(JSON.stringify({ bundleVersion: 1, parts: {}, versions: {} }))).toBe(true);
        expect(isBundleText(JSON.stringify(v1()))).toBe(false);
        expect(isBundleText('{"a":')).toBe(false);
        expect(isBundleText('')).toBe(false);
    });
});
