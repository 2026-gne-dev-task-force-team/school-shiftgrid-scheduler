/**
 * 모바일 첫 판 정책(1.2v 설계 ① 2절, T-9p24) — 순수 함수. narrow() 가 참일 때만 부른다.
 *   보결 설치 → 보결의 첫 판 · 아니면 설치된 것 중 편성 iframe(v1-editor)을 뺀 첫 판 · 없으면 홈.
 *   ⚠️ 보결에는 아직 「내 것」 판이 없다(뷰는 sheet 하나) — 「내 것」 판이 생기면 SUBSTITUTE_FIRST_VIEW 만 바꾼다.
 *   ⛔ 편성 iframe(v1-editor)은 모바일 첫 판으로 열지 않는다.
 */
export const SUBSTITUTE_PLUGIN = 'substitute';
export const SUBSTITUTE_FIRST_VIEW = 'sheet';
export const EDITOR_PLUGIN = 'v1-editor';

export type FirstPane = { plugin: string; view?: string } | 'home';

export function firstPaneForNarrow(o: { installed: string[]; has?: (id: string) => boolean }): FirstPane {
    const ok = (id: string) => (o.has ? o.has(id) : true);
    if (o.installed.includes(SUBSTITUTE_PLUGIN) && ok(SUBSTITUTE_PLUGIN)) {
        return { plugin: SUBSTITUTE_PLUGIN, view: SUBSTITUTE_FIRST_VIEW };
    }
    const first = o.installed.find((id) => id !== EDITOR_PLUGIN && ok(id));
    return first ? { plugin: first } : 'home';
}
