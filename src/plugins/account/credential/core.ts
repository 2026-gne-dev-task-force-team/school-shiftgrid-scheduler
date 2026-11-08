/**
 * 증명(credential · account 꾸러미 안 부품) 엔진 — 「이름+암호」 한 방법으로 증명한다. 🔴 입력 화면은 스스로 띄운다(prompt 자리).
 *   challenge(methodId, userId): 입력을 받아 저장된 해시와 맞나만 돌려준다 — 🔴 ⛔ 비밀번호를 약속으로 주고받지 않는다.
 *   ⭐ prompt 는 갈아 끼는 자리다 — 기본은 다이얼로그(requestSecret), 테스트는 setPrompt 로 입력을 직접 넣는다.
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { CredentialMethod } from '../contracts/credential';
import type { NodesApi, PublicNode } from '../../project-explorer/contracts/nodes';
import { makeHash, verifyHash } from './hash';
import { SECRET_TYPE, type LocalSecret } from './nodes';
import { requestSecret } from './dialog';

export const METHOD: CredentialMethod = { id: 'credential-local.password', title: '이름+암호' };

let nodesApi: NodesApi | null = null;
let promptImpl: (methodId: string, userId: string) => Promise<string | null> = requestSecret;

export function initCredentialLocal(_host: PluginHost, nodes: NodesApi | null): void { nodesApi = nodes; }
/** 입력 창구를 갈아 낀다(기본은 다이얼로그) — 테스트가 입력을 직접 넣을 때 쓴다. */
export function setPrompt(fn: (methodId: string, userId: string) => Promise<string | null>): void { promptImpl = fn; }

export function methods(): CredentialMethod[] { return [METHOD]; }

function secretOf(userId: string): LocalSecret | null {
    const n: PublicNode | undefined = nodesApi?.byType(SECRET_TYPE).find((x) => (x.data as LocalSecret)?.userId === userId);
    return n ? (n.data as LocalSecret) : null;
}

/** 그 사람을 그 방법으로 증명한다 — 입력 화면을 띄워 받고, 저장된 해시와 비교. 통과면 true. */
export async function challenge(methodId: string, userId: string): Promise<boolean> {
    if (methodId !== METHOD.id) return false;
    const sec = secretOf(userId);
    if (!sec) return false;                      // 비밀이 없으면 증명할 길이 없다
    const entered = await promptImpl(methodId, userId);
    if (entered == null) return false;           // 취소
    return verifyHash(entered, sec);
}

/** 그 사용자의 비밀을 걸거나 바꾼다(해시로 저장 · userId 당 한 노드). 평문 0. */
export async function setSecret(userId: string, password: string): Promise<void> {
    if (!nodesApi) return;
    const hashed = await makeHash(password);
    const data: LocalSecret = { userId, ...hashed };
    const existing = nodesApi.byType(SECRET_TYPE).find((x) => (x.data as LocalSecret)?.userId === userId);
    if (existing) nodesApi.setData(existing.id, data);
    else nodesApi.create(nodesApi.roots.main, { type: SECRET_TYPE, name: '비밀', data });
}
export function hasSecret(userId: string): boolean { return !!secretOf(userId); }
