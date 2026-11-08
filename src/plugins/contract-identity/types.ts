/**
 * 🔴 약속 「identity」 0.2 — 지금 **누구**인가. (「이걸 해도 되나」 판정은 permit 약속으로 갈랐다 · 2026-11-08 계정 설계.)
 *   ⭐ 바닥은 정책 0이다(쥔님 14:54). 이 약속은 「누구」의 **모양**만 안다 — 역할 이름·권한 낱말·학교 낱말 0.
 *   ⭐ 갈아 끼는 자리 셋(누구 / 증명 / 판정) 중 「누구」. 증명은 contract-credential, 판정은 contract-permit.
 *
 *   소비자: supports: { identity: '^0.2' } + lifecycle.onInterface.identity.attach 로 미리 적어 둔다.
 *   오늘은 account 제공자가 채우고, 나중에 account-server 가 같은 이름으로 갈아 낀다 — 소비자 무변경.
 *   ⛔ 비밀번호·PIN 을 이 약속으로 주고받지 않는다(증명은 contract-credential 몫).
 */
import type { Disposable } from '../../pane-ui-system/plugin';

/**
 * 지금 로그인한 사람 — current() 는 **항상 객체**(null 없음 · 비로그인은 kind:'guest').
 *   kind — master: 프로젝트 만든 사람(체계 밖 수정자) · guest: 비로그인(아무도 아님) · user: 명단의 그 사람.
 *   verified — 증명을 거쳤나(이름만 댄 사용자는 false · 마스터는 true · 손님은 false).
 *   roles — 이용자가 만든 역할의 id 목록(코드가 아는 역할 이름 0 · 플러그인이 보고 판단할 수 있다).
 *   fields — 다른 플러그인이 꽂은 칸('<pluginId>.<name>' → 값). 뜻은 꽂은 플러그인만 안다(노드 data 와 같은 결).
 */
export interface CurrentUser {
    kind: 'master' | 'guest' | 'user';
    id?: string;                       // user 일 때만(master·guest 는 없음)
    displayName: string;
    verified: boolean;
    roles: string[];
    fields?: Record<string, unknown>;
}

export interface Identity {
    /** 지금 누구 — 항상 객체. 비로그인은 kind:'guest'. */
    current(): CurrentUser;
    /** 사람이 바뀌면(로그인·로그아웃·전환) 울린다. */
    onChange(listener: () => void): Disposable;
}
