/**
 * 모바일 첫 판 정책(1.2v 설계 ① 2절, T-9p24) — 순수 함수. narrow() 가 참일 때만 부른다.
 *   보결 설치 → 보결의 첫 판 · 아니면 설치된 것 중 편성 iframe(v1-editor)을 뺀 첫 판 · 없으면 홈.
 *   P15: 「내 것」 판은 ops-sub 의 mine 뷰다 — ops-sub 가 설치돼 있으면 그것이 첫 판, 없으면 보결 sheet.
 *   ⛔ 편성 iframe(v1-editor)은 모바일 첫 판으로 열지 않는다.
 */
export const SUBSTITUTE_PLUGIN = 'substitute';
export const SUBSTITUTE_FIRST_VIEW = 'sheet';
export const SUB_MINE_PLUGIN = 'ops-sub';
export const SUB_MINE_VIEW = 'mine';
export const EDITOR_PLUGIN = 'v1-editor';

export type FirstPane = { plugin: string; view?: string } | 'home';

export function firstPaneForNarrow(o: { installed: string[]; has?: (id: string) => boolean }): FirstPane {
    const ok = (id: string) => (o.has ? o.has(id) : true);
    if (o.installed.includes(SUB_MINE_PLUGIN) && ok(SUB_MINE_PLUGIN)) {
        return { plugin: SUB_MINE_PLUGIN, view: SUB_MINE_VIEW };
    }
    if (o.installed.includes(SUBSTITUTE_PLUGIN) && ok(SUBSTITUTE_PLUGIN)) {
        return { plugin: SUBSTITUTE_PLUGIN, view: SUBSTITUTE_FIRST_VIEW };
    }
    const first = o.installed.find((id) => id !== EDITOR_PLUGIN && ok(id));
    return first ? { plugin: first } : 'home';
}
