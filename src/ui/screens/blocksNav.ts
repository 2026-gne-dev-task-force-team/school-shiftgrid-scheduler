/** 고정·금지 화면의 탭·앞뒤 단추 — 화면(React)과 떼어 낸 순수 규칙(시험은 DOM 없이 돈다) */
import { L } from '../help/terms';

export type BlocksKind = 'track' | 'agent' | 'resource';
export type BlocksMode = 'block' | 'fixed' | 'pin';

/** 탭 순서 — 반이 맨 앞(고정 수업·잠금은 반 탭에서만 쓴다) */
export const BLOCKS_TABS: BlocksKind[] = ['track', 'agent', 'resource'];

/** 이 탭에서 쓸 수 있는 방식. 교사·특별실은 금지칸만 */
export function modesFor(kind: BlocksKind): BlocksMode[] {
    return kind === 'track' ? ['block', 'fixed', 'pin'] : ['block'];
}
/** 탭을 바꿀 때 방식 — 못 쓰는 방식이면 금지칸으로 */
export function modeAfterTab(kind: BlocksKind, mode: BlocksMode): BlocksMode {
    return modesFor(kind).includes(mode) ? mode : 'block';
}
/** 같은 탭 안에서 이전(-1)/다음(+1) 대상. 끝에서는 멈춘다(돌지 않는다). 없으면 null */
export function stepTarget(ids: string[], current: string, dir: -1 | 1): string | null {
    const i = ids.indexOf(current);
    if (i < 0) return null;
    const j = i + dir;
    return j >= 0 && j < ids.length ? ids[j] : null;
}

/** 탭 이름 — 교사 탭은 기초자료와 같은 「전담·강사」(R131). 시수표 「교사」 열 이름은 그대로 */
export function blocksTabLabel(kind: BlocksKind): string {
    return kind === 'track' ? L.track : kind === 'agent' ? L.agentTab : L.resource;
}
