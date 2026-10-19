/**
 * 컴포넌트 레지스트리 — 「+ 꽂기」 목록과 적용 경로가 여기 하나를 본다.
 * 새 컴포넌트를 더할 땐 파일 하나 만들고 여기 한 줄만 보탠다.
 */
import type { ComponentRegistryEntry } from './types';
import { schoolPeriodsDef } from './schoolPeriods';
import { SchoolPeriodsForm } from './schoolPeriodsForm';
import { colHeadsDef } from './colHeads';
import { ColHeadsForm } from './colHeadsForm';

// 🔴 각 항목은 자기 props 모양(P)으로 정확히 타입이 맞는다 — 레지스트리에 모일 때만
//    공통 모양(Record<string, unknown>)으로 일부러 지운다(플러그인 경계의 의도된 타입 소거).
export const COMPONENT_REGISTRY: Record<string, ComponentRegistryEntry> = {
    [schoolPeriodsDef.id]: { def: schoolPeriodsDef, Form: SchoolPeriodsForm } as unknown as ComponentRegistryEntry,
    [colHeadsDef.id]: { def: colHeadsDef, Form: ColHeadsForm } as unknown as ComponentRegistryEntry,
};

export const COMPONENT_LIST = Object.values(COMPONENT_REGISTRY).map((e) => e.def);
