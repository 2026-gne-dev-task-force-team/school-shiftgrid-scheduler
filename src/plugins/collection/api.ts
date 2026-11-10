/**
 * collection 모듈 값 — host.modules 로 손님에게 가는 RecordViewApi 한 벌.
 *   RecordView 컴포넌트 · 칸 타입 레지스트리(내장 여섯 + 꽂힌 타입) · 순수 변환(schema).
 *   ⛔ 호출자별 팩토리 아님 — 목록 화면 부품은 누가 받아도 같다(자료·보기 정의는 손님이 쥔다).
 */
import type { RecordViewApi } from './contracts/collection';
import { RecordView } from './RecordView';
import { PropertyList } from './views/PropertyList';
import { RecordPage } from './views/RecordPage';
import { planConvert } from './convert';
import { fieldTypes } from './fields/registry';
import { normalizeRelation, relationToText } from './schema';
import { defineCollection } from './define';
import { openRecordTab } from './tab-open';
import { PatternEditor } from './fields/PatternEditor';
import { relationReferrers, resolveRelationTargets } from './fields/cast';
import { relationConfig } from './fields/relation';
import { getNodesApi } from './nodes';

/** 관계 값 따라가기 — 노드 시스템이 아직 없거나 대상이 db 가 아니면 빈 배열 */
function resolveTargets(value: unknown, config: unknown): string[] {
    const look = getNodesApi(), t = relationConfig(config).target;
    return look && t?.kind === 'db' ? resolveRelationTargets(look, t.nodeId, value) : [];
}

export const recordViewApi: RecordViewApi = {
    version: 2,
    RecordView,
    PropertyList,
    RecordPage,
    fieldTypes,
    schema: {
        planConvert, normalizeRelation, relationToText,
        resolveRelationTargets: resolveTargets,
        relationReferrers: (id) => { const look = getNodesApi(); return look ? relationReferrers(look, id) : []; },
    },
    defineCollection,
    openInTab: openRecordTab,
    PatternEditor,
};
