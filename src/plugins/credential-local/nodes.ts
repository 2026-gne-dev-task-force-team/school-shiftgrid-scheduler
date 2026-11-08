/**
 * credential-local ↔ 노드 다리 — 사용자 비밀 해시를 레코드 노드에 싣는다(사용자 목록과 **분리** · 쥔님 2026-11-08).
 *   record: true 라 탐색기에 안 보인다. 🔴 평문 0 — 해시만. userId 당 한 노드.
 */
import type { NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { Hashed } from './hash';

export const SECRET_TYPE = 'credential-local.secret';

/** 비밀 노드 data — 어느 사용자(userId)의 해시인가. */
export interface LocalSecret extends Hashed {
    userId: string;
}

export const credentialLocalNodeTypes: NodeTypeContribution<never>[] = [
    { type: SECRET_TYPE, label: '비밀', record: true },
];
