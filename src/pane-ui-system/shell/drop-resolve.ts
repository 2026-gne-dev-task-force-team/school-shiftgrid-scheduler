/**
 * 드롭 지점 번역 — 포인터 좌표를 「어디에 떨어지나」로. DOM 을 더듬고(elementFromPoint),
 * 존 판정의 숫자(25% 띠·탭 가운데 선)는 순수 함수(layout/drag)에 맡기고, 결과를 moveLeaf 인자로 번역한다.
 *
 * 🔴 트리 연산은 새로 짜지 않는다 — move = { target, pos } 하나로 moveLeaf 가 전부 한다.
 * ⛔ 자기 자신 위에 떨구면 null(아무 일 없음) — moveLeaf 의 target===leafId 방어와 겹으로 막는다.
 * 🔴 DOM 을 읽지만 React 는 모른다(컴포넌트 아님) — fast-refresh 가 DropZones 조각과 안 싸우게 따로 둔다.
 */
import { paneZone, tabDropSide } from '../layout/drag';
import type { MovePos } from '../layout/tree';

/** moveLeaf(ws, dragId, target, pos) 로 넘길 두 값 */
export interface DropMove {
    target: string;
    pos: MovePos;
}

export type DropBox = { left: number; top: number; width: number; height: number };

export type DropPreview =
    | { kind: 'tab'; box: DropBox; side: 'before' | 'after' }   // 탭 사이 — 세로 선
    | { kind: 'edge'; box: DropBox; zone: 'left' | 'right' | 'up' | 'down' }  // 가장자리 — 반쪽 면
    | { kind: 'center'; box: DropBox }   // 가운데/빈 칸 — 전체 면
    | { kind: 'area'; box: DropBox };    // 빈 사이드바 면 — 전체 면

export interface DropResolution {
    move: DropMove;
    preview: DropPreview;
}

const toBox = (r: DOMRect): DropBox => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/**
 * 🔴 포인터 좌표 → 어디에 떨어지나. 순서가 곧 우선순위다:
 *   ①탭 하나 위 → ②탭 줄 빈자리(묶음 끝) → ③빈 사이드바 면 → ④칸 몸통(가장자리/가운데).
 */
export function resolveDropAt(px: number, py: number, dragId: string): DropResolution | null {
    const hit = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!hit) return null;

    // ① 탭 하나 위 — 왼/오 절반으로 before/after
    const row = hit.closest('[data-row-id]') as HTMLElement | null;
    if (row) {
        const leafId = row.getAttribute('data-row-id')!;
        if (leafId === dragId) return null;   // 자기 자신 — 아무 일 없음
        const r = row.getBoundingClientRect();
        const side = tabDropSide(px, { left: r.left, width: r.width });
        return { move: { target: leafId, pos: side }, preview: { kind: 'tab', box: toBox(r), side } };
    }

    // ② 탭 줄 빈자리 — 그 묶음 마지막 탭 뒤로(나 자신은 빼고 센다)
    const bar = hit.closest('[data-tabbar]') as HTMLElement | null;
    if (bar) {
        const rows = Array.from(bar.querySelectorAll<HTMLElement>('[data-row-id]'))
            .filter((el) => el.getAttribute('data-row-id') !== dragId);
        const last = rows[rows.length - 1];
        if (last) {
            const r = last.getBoundingClientRect();
            return {
                move: { target: last.getAttribute('data-row-id')!, pos: 'after' },
                preview: { kind: 'tab', box: toBox(r), side: 'after' },
            };
        }
        // 탭이 (나 말고) 없는 빈 줄 — 자리 이름으로
        const area = hit.closest('[data-area]')?.getAttribute('data-area');
        if (area) return { move: { target: area, pos: 'after' }, preview: { kind: 'area', box: toBox(bar.getBoundingClientRect()) } };
        return null;
    }

    // ③ 빈 사이드바 면 — 자리 이름 타깃
    const empty = hit.closest('[data-empty-area]') as HTMLElement | null;
    if (empty) {
        const area = empty.getAttribute('data-empty-area');
        if (!area) return null;
        return { move: { target: area, pos: 'after' }, preview: { kind: 'area', box: toBox(empty.getBoundingClientRect()) } };
    }

    // ③-b 피크 기둥(W9) — 떨구면 피크 더미로(임시). 'floating' 표식만 보고 판정한다(존 세분 없음 —
    //    피크는 늘 「맨 끝 한 장」만 보이니 before/after 를 가를 자리가 없다, 쥔님 설계).
    const peek = hit.closest('[data-area="floating"]') as HTMLElement | null;
    if (peek) {
        return { move: { target: 'floating', pos: 'after' }, preview: { kind: 'area', box: toBox(peek.getBoundingClientRect()) } };
    }

    // ④ 칸 몸통 — 바깥 25% 띠면 그 방향으로 가르기, 안쪽이면 가운데(탭으로)
    const body = hit.closest('[data-pane-body]') as HTMLElement | null;
    if (body) {
        const pane = body.closest('[data-pane]');
        const leaves = (pane?.getAttribute('data-pane-leaves') ?? '').split(',').filter(Boolean);
        const active = pane?.getAttribute('data-pane-active') ?? '';
        const others = leaves.filter((id) => id !== dragId);
        const r = body.getBoundingClientRect();
        const zone = paneZone(px, py, { left: r.left, top: r.top, width: r.width, height: r.height });

        // 자기뿐(또는 빈) 칸은 가를 수 없다 → 그 자리로 이동만(자리 이름)
        if (others.length === 0) {
            const area = body.closest('[data-area]')?.getAttribute('data-area');
            if (!area) return null;
            return { move: { target: area, pos: 'after' }, preview: { kind: 'center', box: toBox(r) } };
        }
        // ⛔ 사이드바 칸은 가르지 않는다 — 어디에 떨궈도 탭으로 합친다(쥔님 2026-11-01 01:51)
        const bodyArea = body.closest('[data-area]')?.getAttribute('data-area');
        if (zone === 'center' || bodyArea === 'left' || bodyArea === 'right') {
            return { move: { target: others[others.length - 1], pos: 'after' }, preview: { kind: 'center', box: toBox(r) } };
        }
        // 가장자리 — 그 묶음 어느 탭(활성 우선, 나 자신은 피한다)을 기준으로 split
        const rep = active && active !== dragId ? active : others[0];
        return { move: { target: rep, pos: zone }, preview: { kind: 'edge', box: toBox(r), zone } };
    }

    return null;
}
