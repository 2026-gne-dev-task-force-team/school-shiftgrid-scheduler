/**
 * 구독 순수 모델 — normalizeUrl · buildSource(읽기 전용·색·받은 대로) · buildSources(켜짐+lastIcs 만) · defaultColor.
 */
import { describe, it, expect } from 'vitest';
import { normalizeUrl, buildSource, buildSources, defaultColor, COLOR_TOKENS, CORS_HINT, type SubNode } from './model';
import type { CalendarItem } from '../calendar/contracts/calendar';

const items: CalendarItem[] = [
    { id: 'a', title: '신정', start: '2026-01-01', end: '2026-01-02', allDay: true },
    { id: 'b', title: '회의', start: '2026-06-01T09:00', end: '2026-06-01T10:00', allDay: false },
];
const parse = () => items;

describe('normalizeUrl', () => {
    it('webcal:// → https://', () => {
        expect(normalizeUrl('webcal://example.com/a.ics')).toBe('https://example.com/a.ics');
    });
    it('공백을 다듬는다 · https 는 그대로', () => {
        expect(normalizeUrl('  https://x/y.ics ')).toBe('https://x/y.ics');
    });
});

describe('buildSource', () => {
    const src = buildSource('s1', '공휴일', 'warn', items);
    it('읽기 전용(editor 없음)', () => { expect(src.editor).toBeUndefined(); });
    it('id 에 접두사, label 유지', () => {
        expect(src.id).toBe('calendar-subscribe:s1');
        expect(src.label).toBe('공휴일');
    });
    it('색 토큰을 모든 항목에 입힌다', () => {
        expect(src.list('', '').every((i) => i.color === 'warn')).toBe(true);
    });
    it('범위를 안 거르고 받은 대로 전부 돌려준다', () => {
        expect(src.list('2026-01-01', '2026-01-02').map((i) => i.id)).toEqual(['a', 'b']);
    });
    it('색이 없으면 안 입힌다', () => {
        expect(buildSource('s', 'l', undefined, items).list('', '').every((i) => i.color === undefined)).toBe(true);
    });
});

describe('buildSources — 켜짐 + lastIcs 만', () => {
    const subs: SubNode[] = [
        { id: '1', data: { name: '켜짐+캐시', url: 'u', enabled: true, lastIcs: 'X' } },
        { id: '2', data: { name: '꺼짐', url: 'u', enabled: false, lastIcs: 'X' } },
        { id: '3', data: { name: '켜짐+캐시없음', url: 'u', enabled: true } },
    ];
    it('켜져 있고 받아 둔 것만 출처가 된다', () => {
        expect(buildSources(subs, parse).map((s) => s.id)).toEqual(['1']);
    });
});

describe('기타', () => {
    it('defaultColor 는 팔레트를 순환한다', () => {
        expect(defaultColor(0)).toBe(COLOR_TOKENS[0]);
        expect(defaultColor(COLOR_TOKENS.length)).toBe(COLOR_TOKENS[0]);
    });
    it('CORS_HINT 는 「파일로 넣기」를 안내한다', () => {
        expect(CORS_HINT).toContain('파일로 넣기');
    });
});
