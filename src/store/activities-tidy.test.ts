/**
 * R105 — 새 학교 기본 교과 14개 · 안 쓰는 과목 정리 · 특별실 칸에서 새 과목.
 *  · 기본 교과는 새 학교 길에서만 — 옛 파일 올리기(migrateDoc)에는 끼어들면 안 된다.
 *  · 「쓰임」 = 시수표 · 배치(고정 수업 포함) · 특별실 과목 · 저장한 판(boards[].assignments).
 *  · 정리는 syncActivities 를 쓰지 않는다 — 시수 줄이 지워지면 안 된다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyDoc, migrateDoc } from '../types/doc';
import {
    BASIC_ACTIVITY_NAMES, withBasicActivities, usedActivityIds, unusedActivities,
    removeUnusedActivities, renameActivity, syncResources,
} from './doc-ops';
import type { Activity, Resource } from '../types/schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const unusedFixture = () => migrateDoc(JSON.parse(readFileSync(join(HERE, '..', 'io', '__golden__', 'inputs', 'unused-activities.json'), 'utf8')));

describe('기본 교과 14개 (새 학교만)', () => {
    it('줄임말 14개가 순서대로 들어간다', () => {
        const d = withBasicActivities(emptyDoc());
        expect(BASIC_ACTIVITY_NAMES).toHaveLength(14);
        expect(d.activities.map((a) => a.name)).toEqual([
            '국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바생', '슬생', '즐생', '창체',
        ]);
        expect(new Set(d.activities.map((a) => a.id)).size).toBe(14);
        expect(d.activities.every((a) => a.kind === 'activity' && typeof a.attr?.color === 'string')).toBe(true);
    });
    it('emptyDoc · migrateDoc(옛 파일) 에는 끼어들지 않는다', () => {
        expect(emptyDoc().activities).toEqual([]);
        expect(migrateDoc({}).activities).toEqual([]);
        expect(unusedFixture().activities.map((a) => a.name)).toEqual(['영어', '과학', '창체', '음악', '서예', '무용']);
    });
    it('이미 있는 이름은 두 번 넣지 않는다(멱등)', () => {
        const once = withBasicActivities(emptyDoc());
        expect(withBasicActivities(once)).toBe(once);
    });
});

describe('안 쓰는 과목 정리', () => {
    it('쓰임 = 시수표·배치(고정 수업)·특별실·저장한 판 — 나머지만 후보', () => {
        const d = unusedFixture();
        expect([...usedActivityIds(d)].sort()).toEqual(['act-cj', 'act-eng', 'act-mus', 'act-sci']);
        expect(unusedActivities(d).map((a) => a.name)).toEqual(['서예', '무용']);
    });
    it('지우면 과목 목록만 줄고 시수·배치·특별실·판은 그대로', () => {
        const d = unusedFixture();
        const out = removeUnusedActivities(d, unusedActivities(d).map((a) => a.id));
        expect(out.activities.map((a) => a.name)).toEqual(['영어', '과학', '창체', '음악']);
        expect(out.demands).toBe(d.demands);
        expect(out.assignments).toBe(d.assignments);
        expect(out.resources).toBe(d.resources);
        expect(out.boards).toBe(d.boards);
    });
    it('쓰이는 과목 id 를 넘겨도 지우지 않는다', () => {
        const d = unusedFixture();
        const out = removeUnusedActivities(d, ['act-eng', 'act-cj', 'act-sci', 'act-mus']);
        expect(out).toBe(d);
    });
});

describe('과목 이름 고치기', () => {
    it('바꾸면 id 그대로 · 같은 이름·빈 이름은 무시', () => {
        const d = unusedFixture();
        const renamed = renameActivity(d, 'act-calli', '  서예 교실 ');
        expect(renamed.activities.find((a) => a.id === 'act-calli')?.name).toBe('서예 교실');
        expect(renameActivity(d, 'act-calli', '영어')).toBe(d);
        expect(renameActivity(d, 'act-calli', '   ')).toBe(d);
    });
});

describe('특별실 과목 칸에서 새 과목 (과목 탭 없어진 자리)', () => {
    it('syncResources 가 새 과목을 같은 한 번에 들인다', () => {
        const d = emptyDoc();
        const act: Activity = { kind: 'activity', id: 'act-new', name: '코딩' };
        const room: Resource = { kind: 'resource', id: 'r1', name: '컴퓨터실', capacity: 1, activityIds: ['act-new'] };
        const out = syncResources(d, [room], [act]);
        expect(out.activities).toEqual([act]);
        expect(out.resources).toEqual([room]);
        // 새 과목이 없으면 과목 목록은 그대로(같은 배열)
        expect(syncResources(d, [room]).activities).toBe(d.activities);
    });
});
