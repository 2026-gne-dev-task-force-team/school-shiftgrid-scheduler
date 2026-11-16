/**
 * 시수표 덜 채운 줄 보관 · 「수업이 없는 교사」 알림 (T-10cp · R108)
 *  완료 정의: 교사만 고른 줄 → 탭 오가기·되돌리기 → 내보낸 파일 시수에 완성된 줄만 · 줄은 화면에 남아 있음
 */
import { describe, expect, it } from 'vitest';
import { sampleDoc } from '../io/sample';
import type { Doc } from '../types/doc';
import type { SheetRow } from '../ui/parts/Sheet';
import { applyDemandSheet, addAgent } from './doc-ops';
import { fold, unfold } from './demand-sheet';
import {
    DRAFTS_KEY, loadDrafts, saveDrafts, draftsFor, draftsOnSchoolChange,
    pickDrafts, withDrafts, isBlankRow, agentsWithoutClasses, type KeyValueStorage,
} from './demand-drafts';

function memStorage(): KeyValueStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

const blankRow = (id: string): SheetRow => ({ _id: id, 교사: '', 함께수업: '', 과목: '', 학년: '', 반: [], 주당시수: 1, 특별실: '', 특별실사용시수: '', 연속수업: '', 차시순서맞춤: false });

/** 화면 commit 과 같은 길: 줄 → unfold → applyDemandSheet, 덜 채운 줄은 따로 */
function commitRows(doc: Doc, rows: SheetRow[]) {
    const built = unfold(doc, rows);
    return { doc: applyDemandSheet(doc, built), drafts: pickDrafts(doc, rows) };
}

describe('시수표 접기·펼치기(화면에서 떼어 냄)', () => {
    it('샘플: 접었다 펼치면 시수 줄 수가 그대로', () => {
        const d = sampleDoc();
        expect(unfold(d, fold(d)).demands.length).toBe(d.demands.length);
    });
});

describe('덜 채운 줄은 문서 밖에', () => {
    const doc0 = sampleDoc();
    const teacher = doc0.agents.find((a) => a.role === '전담')!.name;
    const draft: SheetRow = { ...blankRow('g-draft'), 교사: teacher };

    it('교사만 고른 줄은 문서 시수에 안 들어가고 덜 채운 줄로 남는다', () => {
        const rows = [...fold(doc0), draft];
        const { doc, drafts } = commitRows(doc0, rows);
        expect(doc.demands.length).toBe(doc0.demands.length);
        expect(drafts.map((r) => r._id)).toEqual(['g-draft']);
        // 내보내기·자동 보관본은 문서 통째를 쓴다 — 거기에 덜 채운 줄이 끼면 안 된다
        expect(JSON.stringify(doc)).not.toContain('g-draft');
    });

    it('다 채운 줄은 덜 채운 줄에서 빠진다', () => {
        const full = fold(doc0)[0];
        expect(pickDrafts(doc0, [full])).toEqual([]);
    });

    it('아무것도 안 고른 줄은 보관하지 않는다', () => {
        expect(isBlankRow(blankRow('x'))).toBe(true);
        expect(isBlankRow(draft)).toBe(false);
        expect(pickDrafts(doc0, [blankRow('x')])).toEqual([]);
    });

    it('시수표를 다시 띄우거나 되돌리기로 다시 접어도 덜 채운 줄이 뒤에 붙는다', () => {
        const { doc, drafts } = commitRows(doc0, [...fold(doc0), draft]);
        // 탭 오가기 = 새로 띄움 = fold(doc) + 보관분
        const remount = withDrafts(fold(doc), drafts);
        expect(remount.at(-1)?._id).toBe('g-draft');
        // 되돌리기 = 앞 문서로 다시 접음 + 보관분
        const undone = withDrafts(fold(doc0), drafts);
        expect(undone.some((r) => r._id === 'g-draft')).toBe(true);
        // 같은 _id 는 두 번 붙지 않는다
        expect(withDrafts([...fold(doc0), draft], [draft]).filter((r) => r._id === 'g-draft').length).toBe(1);
    });
});

describe('브라우저 저장소 shiftgrid.demandDrafts', () => {
    it('학교 표시와 함께 따로 된 열쇠에 쓰고 읽는다', () => {
        const s = memStorage();
        saveDrafts({ school: '고성초', rows: [{ ...blankRow('g1'), 교사: '가람' }] }, s);
        expect([...s.data.keys()]).toEqual([DRAFTS_KEY]);
        const back = loadDrafts(s);
        expect(back.school).toBe('고성초');
        expect(back.rows.map((r) => r._id)).toEqual(['g1']);
    });

    it('다른 학교 문서에서는 보이지 않고, 학교를 바꾸면 비운다', () => {
        const d = { school: '고성초', rows: [{ ...blankRow('g1'), 교사: '가람' }] };
        expect(draftsFor(d, '다른초')).toEqual([]);
        expect(draftsFor(d, '고성초').length).toBe(1);
        expect(draftsOnSchoolChange(d, '다른초')).toEqual({ school: '다른초', rows: [] });
        expect(draftsOnSchoolChange(d, '고성초')).toBe(d);
    });

    it('깨진 값·저장소 없음은 빈 보관으로', () => {
        const s = memStorage();
        s.setItem(DRAFTS_KEY, '{깨짐');
        expect(loadDrafts(s).rows).toEqual([]);
        expect(loadDrafts(undefined).rows).toEqual([]);
    });
});

describe('수업이 없는 교사 알림', () => {
    it('비교과(강사·보건·영양 등)는 빼고, 시수 없는 전담만 뜬다', () => {
        const d = addAgent(sampleDoc(), '새전담', { role: '전담' });
        const d2 = addAgent(d, '보건샘', { role: '비교과' });
        const names = agentsWithoutClasses(d2).map((a) => a.name);
        expect(names).toContain('새전담');
        expect(names).not.toContain('보건샘');
        // 샘플의 비교과(스포츠강사·원어민)는 함께 수업으로 시수가 있어도 없어도 안 뜬다
        expect(names.every((n) => d2.agents.find((a) => a.name === n)?.role !== '비교과')).toBe(true);
    });

    it('덜 채운 줄에 이미 이름이 오른 사람은 뺀다', () => {
        const d = addAgent(sampleDoc(), '새전담', { role: '전담' });
        expect(agentsWithoutClasses(d, [{ ...blankRow('g'), 교사: '새전담' }]).map((a) => a.name)).not.toContain('새전담');
    });
});
