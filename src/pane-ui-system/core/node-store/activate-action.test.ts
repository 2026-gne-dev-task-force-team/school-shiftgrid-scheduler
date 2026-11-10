/**
 * 한 번 누르기·Enter·↑↓ 의 동작 결정(activateVerb) + 「새로 만들기」 후보에서 레코드 제외 — 쥔님 2026-11-02
 *   *"파일 선택 방법 그냥 다시 옵시디언으로 가야겠다"* — 옵시디언식(한 번 누르기=고르기+openable 이면 열기)으로 뒤집었다.
 *   ① openable 은 컨테이너를 이긴다 — 한 번 누르기·Enter 모두 open(toggle 아님)
 *   ② 컨테이너이기만 하면 — 한 번 누르기·Enter 둘 다 toggle(펴기/접기)
 *   ③ openable 도 컨테이너도 아니면 — 둘 다 open(openById 가 못 열면 조용히 아무 일 없음)
 *   ⑤ ↑↓(arrow)는 늘 none — 고르기만(옵시디언도 그렇다)
 *   ④ record 타입은 create 가 있어도 createCandidates 에 안 나온다(탐색기로 레코드를 못 만든다)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerType, clearTypes, activateVerb, createCandidates } from '../nodes/model/types';

beforeEach(() => { clearTypes(); });
afterEach(() => { clearTypes(); });

describe('activateVerb — 옵시디언식(한 번 누르기=Enter) · openable 이 컨테이너를 이긴다', () => {
    it('① 컨테이너 + openable(달력 저장소) → 한 번 누르기·Enter 모두 open · arrow 는 none', () => {
        registerType({
            type: 'cal.store', label: '달력 저장소', icon: 'calendar',
            container: { accepts: ['cal.event'] }, openable: true, open: () => {},
        });
        expect(activateVerb('cal.store', 'click')).toBe('open');
        expect(activateVerb('cal.store', 'enter')).toBe('open');
        expect(activateVerb('cal.store', 'arrow')).toBe('none');
    });

    it('② 컨테이너만(폴더) → 한 번 누르기·Enter 모두 toggle · arrow 는 none', () => {
        registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true });
        expect(activateVerb('folder', 'click')).toBe('toggle');
        expect(activateVerb('folder', 'enter')).toBe('toggle');
        expect(activateVerb('folder', 'arrow')).toBe('none');
    });

    it('② openable 플래그만 있고 open 핸들러가 없으면 열 수 없다 → 컨테이너 규칙(toggle)으로', () => {
        // canOpenType 은 openable + open 핸들러 둘 다를 본다 — 핸들러 없는 컨테이너는 toggle 로 떨어진다
        registerType({ type: 'cal.half', label: '반쪽', icon: 'calendar', container: true, openable: true });
        expect(activateVerb('cal.half', 'click')).toBe('toggle');
        expect(activateVerb('cal.half', 'enter')).toBe('toggle');
        expect(activateVerb('cal.half', 'arrow')).toBe('none');
    });

    it('③ 컨테이너도 openable 도 아닌 타입 → 한 번 누르기·Enter 둘 다 open · 모르는 타입도 open', () => {
        registerType({ type: 'x.leaf', label: '잎', icon: 'file', openable: true, open: () => {} });
        expect(activateVerb('x.leaf', 'click')).toBe('open');
        expect(activateVerb('x.leaf', 'enter')).toBe('open');
        // 등록 안 된 타입(회색) — 컨테이너도 openable 도 아니다 → open(openById 가 못 열면 가만)
        expect(activateVerb('nope', 'click')).toBe('open');
        expect(activateVerb('nope', 'enter')).toBe('open');
        // ↑↓ 는 어느 타입이든 고르기만
        expect(activateVerb('x.leaf', 'arrow')).toBe('none');
        expect(activateVerb('nope', 'arrow')).toBe('none');
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
