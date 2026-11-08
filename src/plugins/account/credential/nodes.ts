/**
 * 증명(credential) ↔ 노드 다리 — account 꾸러미 안 부품 — 사용자 비밀 해시를 레코드 노드에 싣는다(사용자 목록과 **분리** · 쥔님 2026-11-08).
 *   record: true 라 탐색기에 안 보인다. 🔴 평문 0 — 해시만. userId 당 한 노드.
 */
import type { NodeTypeContribution } from '../../../pane-ui-system/plugin';
import type { Hashed } from './hash';

export const SECRET_TYPE = 'account.cred-secret';
/** 꾸러미 통합(2026-11-08) 이전 별도 플러그인 시절의 노드 타입 — 탐색기에 노출되지 않게 record 로 함께 등록하고 자동 이사한다. */
export const LEGACY_SECRET_TYPE = 'credential-local.secret';

/** 비밀 노드 data — 어느 사용자(userId)의 해시인가. */
export interface LocalSecret extends Hashed {
    userId: string;
}

export const credentialLocalNodeTypes: NodeTypeContribution<never>[] = [
    { type: SECRET_TYPE, label: '비밀', record: true },
    { type: LEGACY_SECRET_TYPE, label: '비밀(구)', record: true },
];
