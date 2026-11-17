// 감사 기록 — ④ 4절. 추가 전용: 이 파일엔 쓰기(append)만 있고 고치기·지우기 함수는 두지 않는다.
// 한 줄 = 평문 `id, project_id, at, module, action, target` + 암호문 `body_ct`(`{actorUserId, before, after, note}`).
// AAD 는 ④ `aadAudit`(프로젝트·id·at·kid) — `at` 은 열에 쓴 문자열 그대로 AAD 에 들어간다.
// 사람을 가리키는 값은 평문 열(module·action·target)에 넣지 않는다 — target 은 행 id(무작위).

import { aadAudit } from './crypto/aad.ts';
import { openText, sealText, type Bytes, type KeyRing } from './crypto/envelope.ts';

/** `audit_log` 한 행 그대로(봉투는 바이트) */
export interface DbAudit {
    id: string; project_id: string; at: string; module: string; action: string; target: string | null; body_ct: Bytes;
}

/** 암호문 안 — 행 통째 전·후(없으면 null: 새로 생김·지워짐) */
export interface AuditBody {
    actorUserId: string;
    before: unknown;
    after: unknown;
    note: Record<string, unknown> | null;
}

export interface AuditEntry {
    projectId: string;
    id: string;
    /** ISO 시각 — 열 `at` 과 AAD 에 같은 문자열 */
    at: string;
    module: string;
    action: string;
    target: string | null;
    body: AuditBody;
}

/** 쓰기 한 구멍 — 주입(진입점은 `audit_log` insert 만, 시험은 가짜) */
export interface AuditStore {
    append(row: DbAudit): Promise<void>;
}

/** 순수: 봉하기. `before`·`after` 는 깊은 복사로 얼려 호출 뒤 바뀌어도 기록이 안 변한다. */
export async function sealAudit(ring: KeyRing, e: AuditEntry): Promise<DbAudit> {
    const body: AuditBody = JSON.parse(JSON.stringify(e.body)) as AuditBody;
    return {
        id: e.id, project_id: e.projectId, at: e.at, module: e.module, action: e.action, target: e.target,
        body_ct: await sealText(ring, JSON.stringify(body), (kid) => aadAudit(e.projectId, e.id, e.at, kid)),
    };
}

/** 감사 줄 하나를 덧붙인다 — 이 함수가 감사를 쓰는 유일한 길 */
export async function appendAudit(ring: KeyRing, store: AuditStore, e: AuditEntry): Promise<void> {
    await store.append(await sealAudit(ring, e));
}

/** 읽기(관리자 화면·시험용): 봉투 열기 */
export async function openAudit(ring: KeyRing, r: DbAudit): Promise<AuditBody> {
    return JSON.parse(await openText(ring, r.body_ct, (kid) => aadAudit(r.project_id, r.id, r.at, kid))) as AuditBody;
}
