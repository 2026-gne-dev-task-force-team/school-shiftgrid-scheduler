/**
 * 계정 꾸러미 안 「증명(credential)」 부품 — 이름+암호 한 방법. 🔴 별도 플러그인이 아니라 account 꾸러미의 **내부 모듈**이다
 *   (쥔님 2026-11-08 18:55 「플러그인은 꾸러미다」 — 증명 방식은 그 꾸러미 폴더 안의 부품이고 따로 토글되지 않는다).
 *   account 가 provides.credential 로 내주고 account 자신이 host.modules.use('credential') 로 받아 쓴다(자기 provides 를 자기 use).
 *   입력 화면(CredentialDialog)은 스스로 띄우고, 비밀 해시는 레코드 노드에(평문 0). 🔴 ⛔ 방법 고르기 UI 는 없다(방법 하나).
 */
import type { Credential } from '../contracts/credential';
import * as core from './core';

export { credentialLocalNodeTypes } from './nodes';
export { CredentialDialog } from './CredentialDialog';
export { initCredentialLocal } from './core';

/** credential 약속을 채우는 모듈 — account.modules.credential 와 짝. 소비자(account 자신)가 host.modules.use('credential') 로 받는다. */
export const credentialModule: Credential = {
    methods: () => core.methods(),
    challenge: (methodId, userId) => core.challenge(methodId, userId),
};
