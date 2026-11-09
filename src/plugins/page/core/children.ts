/**
 * 하위 페이지 블록(Q8) — 순수 함수. 페이지 밑에 페이지가 있으면 본문에 「하위 페이지」 줄이 있다(노션 꼴).
 *   🔑 진실은 노드 트리다(누가 누구의 자식인가). 본문의 줄은 「어디에 놓였나」(순서)만 쥐고, 보일 때마다 트리와 맞춘다 —
 *      그래서 탐색기에서 옮기거나 휴지통으로 보내면 줄이 따라가고, 되살리면 돌아온다(쓰기 되돌림 없이 · 루프 없음).
 */
import type { Block, Page } from './types';
import { newId } from './types';

/** 본문 ↔ 자식 페이지 맞추기 — 자식이 아닌 줄은 걷고, 줄 없는 자식은 맨 끝에 붙인다. 바뀐 게 없으면 같은 객체를 돌려준다. */
export function syncChildBlocks(page: Page, childIds: readonly string[]): Page {
    const alive = new Set(childIds);
    const have = new Set<string>();
    let changed = false;
    const blocks: Block[] = [];
    for (const b of page.blocks) {
        if (b.type !== 'childpage') { blocks.push(b); continue; }
        // 자식이 아니게 된 줄 · 같은 자식을 두 번 가리키는 줄(복제 등)은 걷는다
        if (!b.nodeId || !alive.has(b.nodeId) || have.has(b.nodeId)) { changed = true; continue; }
        have.add(b.nodeId);
        blocks.push(b);
    }
    for (const id of childIds) {
        if (have.has(id)) continue;
        blocks.push({ id: newId(), type: 'childpage', text: '', nodeId: id });
        changed = true;
    }
    return changed ? { ...page, blocks } : page;
}

/** 본문에 든 하위 페이지 줄이 가리키는 노드 id 들(순서대로). */
export function childBlockIds(page: Page): string[] {
    return page.blocks.filter((b) => b.type === 'childpage' && b.nodeId).map((b) => b.nodeId!);
}
