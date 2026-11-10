/**
 * 고르기 창이 보여 줄 칸을 만드는 순수 함수들 — 화면(NodeIconPicker)과 분리해 따로 시험한다.
 *   칸 하나 = 저장 문자열(value) + 이름(label) + 구역. 구역 = 제목 + 칸들. 행렬 이동은 rowsOf/moveActive 가 맡는다.
 */
import { ICON_NAMES, type IconName } from '../primitives/Icon';
import { EMOJI_CATEGORIES, searchEmoji } from './emoji-data';
import { serializeNodeIcon, type NodeIconColor } from './model';
import type { ResolvedPack } from './packs';

export const COLS = 8;
export type PickerTab = 'emoji' | 'icon' | 'custom';
export interface Cell { key: string; value: string; label: string }
export interface Section { id: string; title?: string; cells: Cell[] }

const emojiCell = (char: string, label: string): Cell => ({ key: `e:${char}`, value: char, label });

export function emojiSections(query: string, recent: string[]): Section[] {
    const q = query.trim();
    if (q) {
        const hits = searchEmoji(q);
        return hits.length ? [{ id: 'found', cells: hits.map((e) => emojiCell(e.char, e.keywords[0] ?? e.char)) }] : [];
    }
    const out: Section[] = [];
    const rec = recent.filter((r) => !r.startsWith('icon:') && !r.startsWith('custom:'));
    if (rec.length) out.push({ id: 'recent', title: '최근 사용', cells: rec.map((c) => emojiCell(c, c)) });
    for (const c of EMOJI_CATEGORIES) out.push({ id: c.id, title: c.label, cells: c.items.map((e) => emojiCell(e.char, e.keywords[0] ?? e.char)) });
    return out;
}

export function iconSections(query: string, color: NodeIconColor | undefined, recent: string[]): Section[] {
    const q = query.trim().toLowerCase();
    const names = ICON_NAMES.filter((n) => !q || n.toLowerCase().includes(q));
    const cell = (n: IconName): Cell => ({ key: `i:${n}`, value: serializeNodeIcon({ kind: 'icon', name: n, color })!, label: n });
    const out: Section[] = [];
    const rec = q ? [] : recent.filter((r) => r.startsWith('icon:'));
    if (rec.length) out.push({ id: 'recent', title: '최근 사용', cells: rec.map((r) => ({ key: `r:${r}`, value: r, label: r })) });
    if (names.length) out.push({ id: 'all', cells: names.map(cell) });
    return out;
}

export function customSections(query: string, packs: ResolvedPack[], recent: string[]): Section[] {
    const q = query.trim().toLowerCase();
    const out: Section[] = [];
    const rec = q ? [] : recent.filter((r) => r.startsWith('custom:'));
    if (rec.length) out.push({ id: 'recent', title: '최근 사용', cells: rec.map((r) => ({ key: `r:${r}`, value: r, label: r })) });
    for (const p of packs) {
        const icons = p.icons.filter((i) => !q || `${i.name} ${i.id} ${i.keywords.join(' ')} ${p.name}`.toLowerCase().includes(q));
        if (icons.length) out.push({ id: `pack:${p.id}`, title: p.name, cells: icons.map((i) => ({ key: `c:${p.id}:${i.id}`, value: serializeNodeIcon({ kind: 'custom', pack: p.id, id: i.id })!, label: i.name })) });
    }
    return out;
}

/** 구역들을 칸 8개짜리 행으로 자른다 — 값은 평탄 번호 */
export function rowsOf(sections: Section[]): number[][] {
    const rows: number[][] = [];
    let n = 0;
    for (const s of sections) {
        for (let i = 0; i < s.cells.length; i += COLS) {
            rows.push(s.cells.slice(i, i + COLS).map(() => n++));
        }
    }
    return rows;
}

/** 방향키 이동 — 끝에서 멈춘다(돌지 않는다). 위·아래는 같은 열(짧은 행이면 그 행 끝)로 간다. */
export function moveActive(rows: number[][], active: number, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): number {
    const total = rows.reduce((a, r) => a + r.length, 0);
    if (!total) return -1;
    if (active < 0) return 0;
    if (key === 'ArrowLeft') return Math.max(0, active - 1);
    if (key === 'ArrowRight') return Math.min(total - 1, active + 1);
    const ri = rows.findIndex((r) => r.includes(active));
    if (ri < 0) return 0;
    const col = rows[ri].indexOf(active);
    const to = key === 'ArrowUp' ? ri - 1 : ri + 1;
    if (to < 0 || to >= rows.length) return active;
    return rows[to][Math.min(col, rows[to].length - 1)];
}

/** 최근 사용 쌓기 — 맨 앞에 넣고 같은 값은 지우고 열여섯까지 */
export function pushRecent(list: string[], value: string, max = 16): string[] {
    return [value, ...list.filter((v) => v !== value)].slice(0, max);
}
