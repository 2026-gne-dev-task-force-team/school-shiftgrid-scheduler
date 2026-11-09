/**
 * table 모듈 값 — host.modules 로 손님에게 가는 TableApi 한 벌. Table 컴포넌트 + 기능 레지스트리 + TSV 왕복.
 */
import type { ComponentType } from 'react';
import type { TableApi, TableProps } from './contracts/table';
import { Table } from './Table';
import { parseClipboard, toTsv } from '../../pane-ui-system';
import { listFeatureIds, registerFeature } from './features/registry';

export const tableApi: TableApi = {
    version: 1,
    // forwardRef 컴포넌트를 약속의 ComponentType 자리로(런타임 동일 · 손님은 ref 를 안 쓴다).
    Table: Table as unknown as ComponentType<TableProps>,
    features: { list: listFeatureIds, register: registerFeature },
    parseClipboard,
    toTsv,
};
