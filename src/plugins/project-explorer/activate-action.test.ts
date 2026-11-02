/**
 * 두 번 누르기·Enter 의 동작 결정(activateVerb) + 「새로 만들기」 후보에서 레코드 제외 — 쥔님 2026-11-02
 *   *"달력 저장소 열어도 달력 안열리노"* 의 뿌리: 컨테이너이면서 openable 인 타입(달력 저장소)이 open 에 못 가고 toggle 에서 끝났다.
 *   ① openable 은 컨테이너를 이긴다 — 두 번 누르기·Enter 모두 open(toggle 아님)
 *   ② 컨테이너이기만 하면 — Enter 는 toggle, 두 번 누르기는 none(한 번 누르기가 이미 토글했으니 안 되돌린다)
 *   ③ openable 도 컨테이너도 아니면 — 둘 다 open(openById 가 못 열면 조용히 아무 일 없음)
 *   ④ record 타입은 create 가 있어도 createCandidates 에 안 나온다(탐색기로 레코드를 못 만든다)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerType, clearTypes, activateVerb, createCandidates } from './model/types';

beforeEach(() => { clearTypes(); });
afterEach(() => { clearTypes(); });

describe('activateVerb — openable 이 컨테이너를 이긴다', () => {
    it('① 컨테이너 + openable(달력 저장소) → 두 번 누르기·Enter 모두 open', () => {
        registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, openable: true, open: () => {},
        });
        expect(activateVerb('cal.store', 'dblclick')).toBe('open');
        expect(activateVerb('cal.store', 'enter')).toBe('open');
    });

    it('② 컨테이너만(폴더) → Enter 는 toggle, 두 번 누르기는 none', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        expect(activateVerb('folder', 'enter')).toBe('toggle');
        expect(activateVerb('folder', 'dblclick')).toBe('none');
    });

    it('② openable 플래그만 있고 open 핸들러가 없으면 열 수 없다 → 컨테이너 규칙으로', () => {
        // canOpenType 은 openable + open 핸들러 둘 다를 본다 — 핸들러 없는 컨테이너는 toggle/none 으로 떨어진다
        registerType({ type: 'cal.half', label: '반쪽', icon: 'calendar', container: true, openable: true });
        expect(activateVerb('cal.half', 'enter')).toBe('toggle');
        expect(activateVerb('cal.half', 'dblclick')).toBe('none');
    });

    it('③ 컨테이너도 openable 도 아닌 타입 → 둘 다 open · 모르는 타입도 open', () => {
        registerType({ type: 'x.leaf', label: '잎', icon: 'file', openable: true, open: () => {} });
        expect(activateVerb('x.leaf', 'enter')).toBe('open');
        expect(activateVerb('x.leaf', 'dblclick')).toBe('open');
        // 등록 안 된 타입(회색) — 컨테이너도 openable 도 아니다 → open(openById 가 못 열면 가만)
        expect(activateVerb('nope', 'enter')).toBe('open');
        expect(activateVerb('nope', 'dblclick')).toBe('open');
    });
});

describe('createCandidates — 레코드는 후보가 아니다', () => {
    it('④ record: true 는 create 가 있어도 후보에서 빠진다', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
        // record 면서 create 도 있는(이상하지만 가능) 타입 — 폴더가 받더라도 후보에 들면 안 된다
        registerType({
            type: 'x.rec', label: '레코드', icon: 'file', record: true,
            create: { label: '레코드', under: ['folder'] },
        });
        const types = createCandidates('folder').map((d) => d.type);
        expect(types).toContain('folder');
        expect(types).not.toContain('x.rec');
    });
});
