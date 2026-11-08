/**
 * 조립 설치 — resolveFeatures 로 정렬한 모듈을 ctx 로 설치해 Table 이 읽을 설정을 모은다.
 *   caps(켠 능력) · pasteOverflow(붙여넣기 넘침) · keymap(겹치면 던진다) · commitWrappers(확정 직전).
 */
import type { FeatureCtx, PasteOverflow, TableCapability, TableState, TableTx, TableFeature } from '../../contract-table/types';
import { resolveFeatures, type FeatureLookup } from './assemble';

export interface TableConfig {
    caps: Set<TableCapability>;
    pasteOverflow: PasteOverflow;
    keymap: Map<string, () => void>;
    commitWrappers: ((tx: TableTx) => TableTx)[];
    featureIds: string[];
}

const NOOP = { dispose() {} };

/** features 목록 + lookup + 상태 읽기 → 설정 하나. 조립 어긋남(알 수 없는 id·conflicts·순환·키맵 충돌)은 던진다. */
export function buildConfig(
    entries: (string | TableFeature)[],
    lookup: FeatureLookup,
    stateGet: () => TableState,
): TableConfig {
    const ordered = resolveFeatures(entries, lookup);
    const caps = new Set<TableCapability>();
    let pasteOverflow: PasteOverflow = 'clip';     // 정책 모듈이 없으면 자른다
    const keymap = new Map<string, () => void>();
    const commitWrappers: ((tx: TableTx) => TableTx)[] = [];

    const ctx: FeatureCtx = {
        keymap: {
            add(key, run) {
                if (keymap.has(key)) throw new Error(`키맵 충돌: '${key}' 를 두 기능이 잡았다`);
                keymap.set(key, run);
                return { dispose() { if (keymap.get(key) === run) keymap.delete(key); } };
            },
        },
        paste: { overflow(p) { pasteOverflow = p; return NOOP; } },
        commit: { wrap(fn) { commitWrappers.push(fn); return NOOP; } },
        capabilities: { enable(c) { caps.add(c); } },
        state: { get: stateGet, on: () => NOOP },
    };

    for (const f of ordered) f.install(ctx);
    return { caps, pasteOverflow, keymap, commitWrappers, featureIds: ordered.map((f) => f.id) };
}
