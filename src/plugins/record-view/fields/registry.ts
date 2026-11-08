/**
 * 칸 타입 레지스트리 — 칸 종류를 「정의 한 벌」로 등록해 두고 화면·로직이 type 문자열로 조회한다.
 *   🔴 화면이 switch(type) 을 안 한다 — 꽂힌 타입(`<pluginId>.<name>`)이 내장과 같은 길을 탄다(2등 시민 금지).
 *   ⭐ 내장 여섯도 같은 정의 꼴(FieldTypeDef)로 등록된다(builtin.tsx). 관계(relation)는 P1 에선 레지스트리에 안 올린다 — UI 가 P3.
 */
import type { Disposable } from '../../../pane-ui-system/plugin';
import type { FieldTypeDef, FieldTypeRegistry } from '../contracts/record-view';
import { BUILTIN_FIELD_TYPES } from './builtin';

const EXTERNAL = /^[a-z0-9-]+\.[^.]/;
const NOOP: Disposable = { dispose() { /* 빈 것 */ } };

export function createFieldTypeRegistry(seed: readonly FieldTypeDef[] = []): FieldTypeRegistry {
    const defs = new Map<string, FieldTypeDef>();
    const add = (def: FieldTypeDef): Disposable => {
        if (defs.has(def.type)) {
            console.warn(`[record-view] 칸 타입 "${def.type}" 은 이미 등록됐다 — 거부`);
            return NOOP;
        }
        defs.set(def.type, def);
        return { dispose() { if (defs.get(def.type) === def) defs.delete(def.type); } };
    };
    for (const d of seed) add(d);   // 내장 — 접두사 검사 없이 같은 add 를 탄다
    return {
        register(def) {
            // 🔴 꽂힌 타입은 `<pluginId>.<name>` 접두사 강제(노드 타입과 같은 규칙). 내장 이름과 겹치면 add 가 거절한다.
            if (!EXTERNAL.test(def.type)) {
                console.warn(`[record-view] 칸 타입 "${def.type}" 은 "<pluginId>.<name>" 꼴이어야 한다 — 거부`);
                return NOOP;
            }
            return add(def);
        },
        list: () => [...defs.values()],
        get: (type) => defs.get(type),
    };
}

/** 이 꾸러미가 쥐는 레지스트리 하나 — 내장 여섯이 올라 있다. 로직(logic.ts)·화면이 이걸 조회한다. */
export const fieldTypes: FieldTypeRegistry = createFieldTypeRegistry(BUILTIN_FIELD_TYPES);
