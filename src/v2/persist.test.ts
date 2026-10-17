/**
 * 저장·다시 열기 / v1 파일 열기 — 실제 열기 경로(parseProjectFile)를 검산한다.
 * (OS 파일 대화상자는 자동화가 안 돼 눈 확인 대신 여기서 코드 경로를 못박는다.)
 */
import { describe, it, expect } from 'vitest';
import { parseProjectFile, serializeProject } from './persist';
import * as ops from './ops';
import { sampleDoc } from '../io/sample';

describe('저장 → 다시 열기 (v2 왕복)', () => {
    it('저장한 글자를 다시 열면 그대로 돌아온다', () => {
        const { project, sheet } = ops.createSheet(ops.newProject('고성초', '2학기'));
        const withCell = ops.setSheetCell(project, sheet.id, '0', '0', '체육');
        const text = serializeProject(withCell);

        const { project: back, report } = parseProjectFile(text);
        expect(report).toBeNull(); // v2 파일이라 변환 리포트 없음
        expect(back.name).toBe('고성초');
        expect(back.sheets).toHaveLength(1);
        expect(back.sheets[0].cells['0:0']).toEqual({ kind: 'text', text: '체육' });
    });
});

describe('v1 파일 열기', () => {
    it('v1 Doc 글자를 열면 반→표로 펴지고 변환 리포트가 ok 로 온다', () => {
        const v1text = JSON.stringify(sampleDoc());
        const { project, report } = parseProjectFile(v1text);
        expect(report).not.toBeNull();
        expect(report!.ok).toBe(true);
        expect(project.sheets.length).toBe(sampleDoc().tracks.length);
        expect(project.legacy).not.toBeNull();
    });
});
