// @vitest-environment jsdom
/**
 * 노드 아이콘 공통 모듈 — 옛 값 이어받기 · 이모지 검색 · 커스텀 묶음 등록·소독 · 고르기 창 키보드.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseNodeIcon, serializeNodeIcon } from './model';
import { ALL_EMOJI, EMOJI_CATEGORIES, searchEmoji } from './emoji-data';
import { safeImageUrl, sanitizeSvg } from './svg-sanitize';
import { addIconPack, listIconPacks } from './packs';
import { moveActive, pushRecent, rowsOf, emojiSections } from './cells';
import { NodeIcon } from './NodeIcon';
import { NodeIconPanel } from './NodeIconPicker';
import { activateAll, listPlugins } from '../plugin';
import { iconPackBasicPlugin, ICON_PACK_BASIC_ICONS } from '../core/icon-pack-basic';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('옛 저장값 이어받기', () => {
    it('접두사 없는 문자열은 전부 이모지로 읽는다(옛 값 그대로)', () => {
        expect(parseNodeIcon('📌')).toEqual({ kind: 'emoji', value: '📌' });
        expect(parseNodeIcon('❤️')).toEqual({ kind: 'emoji', value: '❤️' });
        expect(parseNodeIcon('AB')).toEqual({ kind: 'emoji', value: 'AB' });   // 직접 입력했던 글자도
    });
    it('빈 값·없음은 undefined', () => {
        expect(parseNodeIcon('')).toBeUndefined();
        expect(parseNodeIcon('  ')).toBeUndefined();
        expect(parseNodeIcon(undefined)).toBeUndefined();
        expect(parseNodeIcon(null)).toBeUndefined();
    });
    it('icon·custom 은 접두사 꼴에서 읽고, 값으로 되돌려도 같다', () => {
        expect(parseNodeIcon('icon:home:ok')).toEqual({ kind: 'icon', name: 'home', color: 'ok' });
        expect(parseNodeIcon('icon:home')).toEqual({ kind: 'icon', name: 'home', color: undefined });
        expect(parseNodeIcon('icon:home:없는색')?.kind).toBe('icon');
        expect((parseNodeIcon('icon:home:없는색') as { color?: string }).color).toBeUndefined();
        expect(parseNodeIcon('custom:basic:star')).toEqual({ kind: 'custom', pack: 'basic', id: 'star' });
        for (const s of ['📌', 'icon:home:ok', 'icon:gear', 'custom:basic:star']) expect(serializeNodeIcon(parseNodeIcon(s))).toBe(s);
    });
    it('값 객체를 그대로 줘도 받는다', () => {
        expect(parseNodeIcon({ kind: 'emoji', value: '🔥' })).toEqual({ kind: 'emoji', value: '🔥' });
    });
});

describe('이모지 목록·검색', () => {
    it('분류 여덟 · 수백 개 이상', () => {
        expect(EMOJI_CATEGORIES.map((c) => c.label)).toEqual(['사람', '동물·자연', '음식', '활동', '여행·장소', '사물', '기호', '깃발']);
        expect(ALL_EMOJI.length).toBeGreaterThanOrEqual(500);
        expect(ALL_EMOJI.every((e) => e.char.length > 0)).toBe(true);
    });
    it('한글·영어 키워드로 찾는다', () => {
        expect(searchEmoji('하트').some((e) => e.char === '❤️')).toBe(true);
        expect(searchEmoji('HEART').some((e) => e.char === '❤️')).toBe(true);
        expect(searchEmoji('강아지').map((e) => e.char)).toContain('🐶');
        expect(searchEmoji('coffee').map((e) => e.char)).toContain('☕');
        expect(searchEmoji('음식').length).toBeGreaterThan(50);   // 분류 이름으로도 걸린다
    });
    it('없는 낱말·빈 검색어는 빈 결과', () => {
        expect(searchEmoji('zzzqqq')).toEqual([]);
        expect(searchEmoji('   ')).toEqual([]);
    });
    it('최근 사용은 맨 앞 · 중복 제거 · 열여섯 상한', () => {
        expect(pushRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
        expect(pushRecent(Array.from({ length: 16 }, (_, i) => `x${i}`), 'new')).toHaveLength(16);
        expect(emojiSections('', ['🔥'])[0]).toMatchObject({ id: 'recent', title: '최근 사용' });
    });
});

describe('SVG 소독', () => {
    const bad = '<svg width="500" height="500" onload="alert(1)" viewBox="0 0 24 24"><script>alert(1)</script>'
        + '<path d="M0 0L5 5" onclick="x()" style="fill:red" fill="url(http://evil/x)"/>'
        + '<foreignObject><div>hi</div></foreignObject>'
        + '<a href="javascript:alert(1)"><circle cx="1" cy="1" r="1"/></a>'
        + '<image href="http://evil/p.png"/><use href="http://evil#a"/>'
        + '<g><rect x="1" y="1" width="2" height="2" fill="currentColor"/></g></svg>';
    it('script·on*·style·외부 href·foreignObject 를 걷어 낸다', () => {
        const out = sanitizeSvg(bad)!;
        expect(out).not.toMatch(/script|onload|onclick|style=|foreignObject|javascript|evil|<image|<use|<a[ >]/i);
        expect(out).toContain('<path d="M0 0L5 5"');
        expect(out).toContain('<rect');
        expect(out).toContain('width="100%"');   // 크기는 밖이 정한다
    });
    it('SVG 가 아니면 null · 이미지 주소는 안전한 꼴만', () => {
        expect(sanitizeSvg('<div>x</div>')).toBeNull();
        expect(safeImageUrl('https://a.b/c.png')).toBe('https://a.b/c.png');
        expect(safeImageUrl('/icons/a.png')).toBe('/icons/a.png');
        expect(safeImageUrl('javascript:alert(1)')).toBeNull();
        expect(safeImageUrl('http://a.b/c.png')).toBeNull();
        expect(safeImageUrl('//evil.com/a.png')).toBeNull();
        expect(safeImageUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
        expect(safeImageUrl('data:image/png;base64,iVBOR')).not.toBeNull();
    });
});

describe('커스텀 묶음 등록', () => {
    afterEach(() => { for (const p of listIconPacks().filter((x) => x.id.startsWith('t-'))) addIconPack('t', { id: p.id, name: '', icons: [] }).dispose(); });
    it('등록하면 소독돼 목록에 서고, dispose 하면 빠진다 · 못 쓰는 그림은 뺀다', () => {
        const d = addIconPack('t', { id: 't-one', name: '시험', icons: [
            { id: 'ok', name: '좋음', svg: '<svg viewBox="0 0 24 24"><script>1</script><path d="M1 1"/></svg>' },
            { id: 'img', name: '그림', url: 'https://x.y/z.png' },
            { id: 'evil', name: '나쁨', url: 'javascript:alert(1)' },
            { id: 'nosvg', name: '비svg', svg: '<p>x</p>' },
        ] });
        const p = listIconPacks().find((x) => x.id === 't-one')!;
        expect(p.icons.map((i) => i.id)).toEqual(['ok', 'img']);
        expect(p.icons[0].svg).not.toMatch(/script/);
        d.dispose();
        expect(listIconPacks().some((x) => x.id === 't-one')).toBe(false);
    });
    it('꾸러미 icon-pack-basic 을 켜면 contributes.iconPacks 가 등록소에 서고 장부에도 남는다', () => {
        activateAll([iconPackBasicPlugin]);
        const p = listIconPacks().find((x) => x.id === 'basic')!;
        expect(p.icons).toHaveLength(ICON_PACK_BASIC_ICONS.length);
        expect(p.icons.length).toBeGreaterThanOrEqual(10);
        expect(listPlugins().find((x) => x.id === 'icon-pack-basic')?.enabled).toBe(true);
    });
});

describe('화면', () => {
    let root: Root; let box: HTMLDivElement;
    beforeEach(() => { box = document.createElement('div'); document.body.appendChild(box); root = createRoot(box); });
    afterEach(() => { act(() => root.unmount()); box.remove(); });

    it('NodeIcon: 이모지·기본 아이콘(색)·커스텀 SVG·없는 묶음은 fallback', () => {
        addIconPack('t', { id: 't-r', name: 'r', icons: [{ id: 'a', name: 'a', svg: '<svg><path d="M1 1"/><script>x</script></svg>' }] });
        act(() => { root.render(<><NodeIcon value="📌" /><NodeIcon value="icon:home:ok" /><NodeIcon value="custom:t-r:a" /><NodeIcon value="custom:없음:a" fallback={<i data-fb />} /></>); });
        expect(box.querySelector('[data-node-icon="emoji"]')?.textContent).toBe('📌');
        expect(box.querySelector('svg.text-ok')).not.toBeNull();
        const c = box.querySelector('[data-node-icon="custom"]')!;
        expect(c.innerHTML).toContain('<path');
        expect(c.innerHTML).not.toMatch(/script/);
        expect(box.querySelector('[data-fb]')).not.toBeNull();
    });

    it('같은 그림을 여러 번 그려도 gradient id 가 겹치지 않고 참조가 따라간다', () => {
        addIconPack('t', { id: 't-g', name: 'g', icons: [{ id: 'g', name: 'g', svg: '<svg><defs><linearGradient id="gr"><stop offset="0"/></linearGradient></defs><rect width="5" height="5" fill="url(#gr)"/></svg>' }] });
        act(() => { root.render(<><NodeIcon value="custom:t-g:g" /><NodeIcon value="custom:t-g:g" /></>); });
        const ids = [...box.querySelectorAll('[id]')].map((e) => e.id);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        const fills = [...box.querySelectorAll('rect')].map((r) => r.getAttribute('fill'));
        expect(fills.map((f) => f!.replace(/^url\(#|\)$/g, ''))).toEqual(ids);
    });

    it('탭: 고른 탭만 tabindex 0 · ←→ Home End 로 옮기고 격자는 안 움직인다', () => {
        act(() => { root.render(<NodeIconPanel value={undefined} onPick={() => {}} />); });
        const tabs = () => [...box.querySelectorAll<HTMLElement>('[role="tab"]')];
        expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
        key(tabs()[0], 'ArrowRight');
        expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
        expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
        expect(document.activeElement).toBe(tabs()[1]);
        key(tabs()[1], 'End');
        expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
        key(tabs()[2], 'ArrowRight');   // 끝에서 처음으로
        expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
        key(tabs()[0], 'ArrowLeft');
        expect(tabs()[2].getAttribute('aria-selected')).toBe('true');
        key(tabs()[2], 'Home');
        expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
        expect(box.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(1);
        expect(box.querySelector('[role="option"][aria-selected="true"]')!.id).toBe(box.querySelector('input')!.getAttribute('aria-activedescendant'));
    });

    it('지우기: 알림에 되돌리기가 붙고 누르면 직전 값으로 돌아간다 · 색 점에 title', async () => {
        const { getCommand } = await import('../plugin/store');
        const { runCommand } = await import('../plugin/store');
        const picked: (string | undefined)[] = [];
        act(() => { root.render(<NodeIconPanel value="📌" onPick={(v) => picked.push(v)} />); });
        act(() => { [...box.querySelectorAll('button')].find((b) => b.textContent?.includes('지우기'))!.click(); });
        expect(picked).toEqual([undefined]);
        expect(getCommand('node-icon.undoClear')).toBeDefined();
        act(() => { runCommand('node-icon.undoClear'); });
        expect(picked).toEqual([undefined, '📌']);
        act(() => { [...box.querySelectorAll<HTMLElement>('[role="tab"]')][1].click(); });
        expect(box.querySelector('[role="radio"][aria-label="초록"]')!.getAttribute('title')).toBe('초록');
    });

    const type = (el: HTMLInputElement, v: string) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    };
    const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });

    it('고르기 창: 검색 → 방향키 → Enter 로 고른다', () => {
        const picked: (string | undefined)[] = [];
        act(() => { root.render(<NodeIconPanel value={undefined} onPick={(v) => picked.push(v)} />); });
        const input = box.querySelector('input[aria-label="아이콘 검색"]') as HTMLInputElement;
        type(input, '강아지');
        key(input, 'Enter');
        expect(picked).toEqual(['🐶']);
        type(input, '하트');
        key(input, 'ArrowRight');   // 검색어가 있으면 좌우는 캐럿 몫 — 안 움직인다
        key(input, 'ArrowDown');    // 한 행 아래(한 줄뿐이라 제자리)
        key(input, 'Enter');
        expect(picked.length).toBe(2);
        expect(searchEmoji('하트').map((e) => e.char)).toContain(picked[1]);
    });

    it('고르기 창: 한글 조합 중 Enter 는 고르지 않는다', () => {
        const picked: (string | undefined)[] = [];
        act(() => { root.render(<NodeIconPanel value={undefined} onPick={(v) => picked.push(v)} />); });
        const input = box.querySelector('input') as HTMLInputElement;
        type(input, '강');
        key(input, 'Enter', { isComposing: true });
        key(input, 'Enter', { keyCode: 229 });
        expect(picked).toEqual([]);
    });

    it('고르기 창: 탭 셋 · 아이콘 탭은 색 포함 값 · 커스텀 탭은 묶음별 · 지우기·무작위', () => {
        addIconPack('t', { id: 't-p', name: '내 묶음', icons: [{ id: 'z', name: '제트', svg: '<svg><path d="M1 1"/></svg>' }] });
        const picked: (string | undefined)[] = [];
        act(() => { root.render(<NodeIconPanel value="📌" onPick={(v) => picked.push(v)} />); });
        const tabs = [...box.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
        expect(tabs).toEqual(['이모지', '아이콘', '커스텀']);
        const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
        click([...box.querySelectorAll('[role="tab"]')][1]);
        click(box.querySelector('[role="radio"][aria-label="초록"]'));
        click(box.querySelector('[role="option"][aria-label="home"]'));
        expect(picked.at(-1)).toBe('icon:home:ok');
        click([...box.querySelectorAll('[role="tab"]')][2]);
        expect(box.textContent).toContain('내 묶음');
        click(box.querySelector('[role="option"][aria-label="제트"]'));
        expect(picked.at(-1)).toBe('custom:t-p:z');
        click([...box.querySelectorAll('button')].find((b) => b.textContent === '무작위'));
        expect(picked.at(-1)).toMatch(/^custom:/);
        click([...box.querySelectorAll('button')].find((b) => b.textContent?.includes('지우기')));
        expect(picked.at(-1)).toBeUndefined();
        expect(picked).toHaveLength(4);
    });
});

describe('행렬 이동', () => {
    it('좌우는 끝에서 멈추고 위아래는 같은 열(짧은 행이면 끝)로 간다', () => {
        const rows = rowsOf([{ id: 'a', cells: Array.from({ length: 11 }, (_, i) => ({ key: `${i}`, value: `${i}`, label: '' })) }]);
        expect(rows.map((r) => r.length)).toEqual([8, 3]);
        expect(moveActive(rows, 0, 'ArrowLeft')).toBe(0);
        expect(moveActive(rows, 10, 'ArrowRight')).toBe(10);
        expect(moveActive(rows, 1, 'ArrowDown')).toBe(9);
        expect(moveActive(rows, 7, 'ArrowDown')).toBe(10);
        expect(moveActive(rows, 9, 'ArrowUp')).toBe(1);
        expect(moveActive(rows, 3, 'ArrowUp')).toBe(3);
    });
});
