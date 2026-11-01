/**
 * 드롭 지점 번역 — 포인터 좌표를 「어디에 떨어지나」로. DOM 을 더듬고(elementFromPoint),
 * 존 판정의 숫자(25% 띠·탭 가운데 선)는 순수 함수(layout/drag)에 맡기고, 결과를 moveLeaf 인자로 번역한다.
 *
 * 🔴 트리 연산은 새로 짜지 않는다 — move = { target, pos } 하나로 moveLeaf 가 전부 한다.
 * ⛔ 자기 자신 위에 떨구면 null(아무 일 없음) — moveLeaf 의 target===leafId 방어와 겹으로 막는다.
 * 🔴 DOM 을 읽지만 React 는 모른다(컴포넌트 아님) — fast-refresh 가 DropZones 조각과 안 싸우게 따로 둔다.
 */
import { paneZone, tabDropSide } from '../../interactive/drag-geometry';
import type { MovePos } from '../../layout/tree';
import { canPlace, canSplit } from '../../view-registry';

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

type DestArea = 'left' | 'center' | 'right';
const areaOf = (el: Element | null): DestArea | null =>
    (el?.closest('[data-area]')?.getAttribute('data-area') as DestArea | null) ?? null;

/**
 * 🔴 포인터 좌표 → 어디에 떨어지나. 순서가 곧 우선순위다:
 *   ①탭 하나 위 → ②탭 줄 빈자리(묶음 끝) → ③빈 사이드바 면 → ④칸 몸통(가장자리/가운데).
 *
 * 🔴 ⭐ dragViewId 를 주면 placement 를 같이 본다 — 허용 안 되는 자리면 **미리보기를 안 그린다**(null).
 *    쥔님이 짚은 구멍: 파란 미리보기가 허용 안 되는 자리에도 떴다 → 드롭 판정(canPlace·canSplit)과
 *    같은 눈을 쓰게 한다(여기서 null 이면 DropZones 도 안 그리고 onDrop 도 안 옮긴다).
 *    ⛔ dragViewId 가 없으면(옛 호출) 제한 없이 — 자리표시 leaf 등은 전부 허용.
 */
export function resolveDropAt(px: number, py: number, dragId: string, dragViewId?: string): DropResolution | null {
    // 이 자리(area)·방향(pos)에 이 뷰를 떨궈도 되나 — area 를 모르면(null) 막지 않는다
    const allowed = (area: DestArea | null, pos: MovePos): boolean => {
        if (!dragViewId || !area) return true;
        if (!canPlace(dragViewId, area)) return false;
        // 가장자리(새 split)면 가르기 허용도 본다 — before/after(탭으로 합치기)는 자리만 본다
        if ((pos === 'left' || pos === 'right' || pos === 'up' || pos === 'down') && !canSplit(dragViewId)) return false;
        return true;
    };

    const hit = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!hit) return null;

    // ① 탭 하나 위 — 왼/오 절반으로 before/after
    //    🔴 탭 줄(data-tabbar) 안의 data-row-id 만 탭으로 본다 — 플러그인 패널 줄(프로젝트 탐색기 등)도
    //    data-row-id 를 쓰므로(공용 useDragLeaf 요구), 그걸 안 가르면 탭을 패널 줄 위로 끌 때 그 줄이
    //    드롭 가능으로 반응한다(실측: 미니 캘린더 탭이 탐색기 폴더에 들어갈 듯 반짝 · 실제론 안 들어감).
    const row = hit.closest('[data-tabbar] [data-row-id]') as HTMLElement | null;
    if (row) {
        const leafId = row.getAttribute('data-row-id')!;
        if (leafId === dragId) return null;   // 자기 자신 — 아무 일 없음
        const r = row.getBoundingClientRect();
        const side = tabDropSide(px, { left: r.left, width: r.width });
        if (!allowed(areaOf(row), side)) return null;
        return { move: { target: leafId, pos: side }, preview: { kind: 'tab', box: toBox(r), side } };
    }

    // ② 탭 줄 빈자리 — 그 묶음 마지막 탭 뒤로(나 자신은 빼고 센다)
    const bar = hit.closest('[data-tabbar]') as HTMLElement | null;
    if (bar) {
        if (!allowed(areaOf(bar), 'after')) return null;
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
        const area = areaOf(hit);
        if (area) return { move: { target: area, pos: 'after' }, preview: { kind: 'area', box: toBox(bar.getBoundingClientRect()) } };
        return null;
    }

    // ③ 빈 사이드바 면 — 자리 이름 타깃
    const empty = hit.closest('[data-empty-area]') as HTMLElement | null;
    if (empty) {
        const area = empty.getAttribute('data-empty-area') as DestArea | null;
        if (!area) return null;
        if (!allowed(area, 'after')) return null;
        return { move: { target: area, pos: 'after' }, preview: { kind: 'area', box: toBox(empty.getBoundingClientRect()) } };
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
        const bodyArea = areaOf(body);

        // 자기뿐(또는 빈) 칸은 가를 수 없다 → 그 자리로 이동만(자리 이름)
        if (others.length === 0) {
            if (!bodyArea || !allowed(bodyArea, 'after')) return null;
            return { move: { target: bodyArea, pos: 'after' }, preview: { kind: 'center', box: toBox(r) } };
        }
        // ⛔ 사이드바 칸은 가르지 않는다 — 어디에 떨궈도 탭으로 합친다(쥔님 2026-11-01 01:51)
        if (zone === 'center' || bodyArea === 'left' || bodyArea === 'right') {
            if (!allowed(bodyArea, 'after')) return null;
            return { move: { target: others[others.length - 1], pos: 'after' }, preview: { kind: 'center', box: toBox(r) } };
        }
        // 가장자리 — 그 묶음 어느 탭(활성 우선, 나 자신은 피한다)을 기준으로 split
        if (!allowed(bodyArea, zone)) return null;
        const rep = active && active !== dragId ? active : others[0];
        return { move: { target: rep, pos: zone }, preview: { kind: 'edge', box: toBox(r), zone } };
    }

    return null;
}
