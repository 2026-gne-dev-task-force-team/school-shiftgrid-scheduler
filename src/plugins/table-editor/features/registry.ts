/**
 * 기능 모듈 레지스트리 — 내장 + 다른 플러그인이 런타임에 꽂은 것. Table 과 TableApi.features 가 같이 본다.
 *   조립기(resolveFeatures)의 lookup 은 이걸 쓴다.
 */
import type { Disposable } from '../../../pane-ui-system/plugin';
import type { TableFeature } from '../../contract-table/types';
import { BUILTIN } from './modules';

const registered = new Map<string, TableFeature>();

/** id → 모듈(내장 먼저, 없으면 등록된 것). */
export function lookupFeature(id: string): TableFeature | undefined {
    return BUILTIN[id] ?? registered.get(id);
}

/** 다른 플러그인이 새 기능 모듈을 전역으로 꽂는다(런타임 · Disposable). ⛔ 내장 id 는 못 덮는다. */
export function registerFeature(f: TableFeature): Disposable {
    if (BUILTIN[f.id]) throw new Error(`내장 기능 '${f.id}' 는 덮을 수 없다`);
    registered.set(f.id, f);
    return { dispose() { if (registered.get(f.id) === f) registered.delete(f.id); } };
}

/** 지금 쓸 수 있는 모든 기능 id. */
export function listFeatureIds(): string[] {
    return [...new Set([...Object.keys(BUILTIN), ...registered.keys()])];
}
