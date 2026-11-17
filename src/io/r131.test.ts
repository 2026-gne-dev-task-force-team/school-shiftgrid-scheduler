import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { L } from '../ui/help/terms';
import { SCREENS } from '../ui/screens';
import { RICH } from '../ui/help/richContent';
import { BLOCKS_TABS, blocksTabLabel } from '../ui/screens/blocksNav';
import { draftNotice } from '../store/demand-drafts';
import { blankWorkbook } from './excel';
import { emptyDoc } from '../types/doc';
import { BASIC_ACTIVITY_NAMES, withBasicActivities } from '../store/doc-ops';

// R131 — 선생님 원문 대비 빠진 것 (지어낸 자료만)
describe('R131 ① 자동 배정 전 덜 채운 줄 알림', () => {
    it('0줄이면 글이 없다', () => { expect(draftNotice(0)).toBe(''); });
    it('N줄이면 개수를 넣은 한 줄(막는 말 없음)', () => {
        expect(draftNotice(3)).toBe('덜 채운 줄 3개는 빼고 배정합니다');
        expect(draftNotice(3)).not.toMatch(/할 수 없|막/);
    });
});

describe('R131 ② 고정·금지 교사 탭 이름', () => {
    it('교사 탭 이름이 기초자료와 같은 「전담·강사」, 나머지는 그대로', () => {
        expect(BLOCKS_TABS.map(blocksTabLabel)).toEqual([L.track, L.agentTab, L.resource]);
        expect(blocksTabLabel('agent')).toBe('전담·강사');
    });
});

describe('R131 ③ 없앤 과목 탭 글', () => {
    it('환영 화면·화면 설명이 과목 탭을 가리키지 않는다', () => {
        const welcome = readFileSync(new URL('../ui/help/Welcome.tsx', import.meta.url), 'utf8');
        expect(welcome).not.toContain('「과목」');
        expect(SCREENS.find((s) => s.id === 'basic')!.desc).not.toContain('과목');
    });
    it('도움말에 과목 시트 항목이 없다', () => {
        expect(Object.keys(RICH)).not.toContain('sheetActivities');
    });
});

describe('R131 ④ 엑셀 양식 과목 시트', () => {
    it('시트는 남고 새 학교 양식엔 기본 교과 14개가 채워진다', () => {
        const wb = XLSX.read(blankWorkbook(withBasicActivities(emptyDoc())), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['과목'], { header: 1 }).slice(1).map((r) => r[0]);
        expect(rows).toEqual([...BASIC_ACTIVITY_NAMES]);
        expect(rows).toHaveLength(14);
    });
});
