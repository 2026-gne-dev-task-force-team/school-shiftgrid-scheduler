/**
 * 「계정」 꾸러미 — 약속 셋(identity·credential·permit)을 **들고 와**(contributes.interfaces) 누구·판정·증명을 채운다(provides).
 *   🔴 증명(credential)은 꾸러미 안 내부 모듈이다(./credential · 2026-11-08 「플러그인은 꾸러미다」 — 따로 토글 안 됨). 자기 provides 를 자기 use.
 *   🔴 바닥 정책 0(쥔님 2026-11-08 14:54) — 역할 이름·권한 기본값·처음 상태를 박지 않는다. 블록(길 셋)만 내주고 정책은 화면에서 사람이 건다.
 *   ⭐ 유일하게 바닥이 아는 상태는 마스터(프로젝트 만든 사람 · 체계 밖 수정자). 암호 없으면 마스터로 시작, 걸면 손님으로 시작.
 *
 * 선언형 전환: 설정 패널·노드 타입을 contributes 로 적고, 모듈(identity·permit·credential)은 호출자별/고정으로 내놓는다.
 *   🔴 import type 만 — 약속 타입은 꾸러미의 contracts/ 에서(값은 host.modules.use). provides·requires 는 약속 **이름**에만 건다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, Disposable, PerCallerApi } from '../../pane-ui-system/plugin';
import type { Identity } from './contracts/identity';
import type { Permit } from './contracts/permit';
import type { NodesApi } from '../project-explorer/contracts/nodes';
import { manifest } from './manifest';
import { accountNodeTypes, accountSecretNodeTypes, accountNodeTypeImpl, USER_TYPE, ROLE_TYPE } from './nodes';
import { AccountProps } from './panes/AccountProps';
import * as core from './core';
// 🔴 증명(credential)은 account 꾸러미 안 내부 모듈 — 별도 플러그인이 아니다(2026-11-08 「플러그인은 꾸러미다」).
import { credentialModule, credentialLocalNodeTypes, initCredentialLocal } from './credential';
import { AccountEditor } from './panes/AccountEditor';
import { ProjectPasswordPane } from './panes/ProjectPasswordPane';
import { AccountStatus } from './panes/AccountStatus';

// 🔴 증명 입력창(전역 오버레이) — 앱(App.tsx)이 이 꾸러미에서 받아 전역에 한 번 마운트한다(Contributes 엔 전역 오버레이 기여점이 없다).
export { CredentialDialog } from './credential';

/** 호출자별 팩토리로 감싼다 — host.modules.use 가 (소비자, scope track) 으로 부른다. 소비자 구독이 (소비자, 약속) scope 에 모인다. */
function perCaller<T>(make: (track?: (d: Disposable) => Disposable) => T): PerCallerApi<T> {
    const fn = (_callerId: string | undefined, track?: (d: Disposable) => Disposable) => make(track);
    (fn as unknown as { __perCaller: true }).__perCaller = true;
    return fn as unknown as PerCallerApi<T>;
}

const identityModule = perCaller<Identity>((track) => ({
    current: () => core.getCurrent(),
    onChange: (fn) => { const d = core.onIdentityChange(fn); return track ? track(d) : d; },
}));

const permitModule = perCaller<Permit>((track) => ({
    can: (permission) => core.can(permission),
    onChange: (fn) => { const d = core.onPermitChange(fn); return track ? track(d) : d; },
}));

export const accountPlugin = definePlugin({
    manifest: {
        ...manifest,
        // 🔴 누구·판정·증명을 전부 채운다 — 증명은 꾸러미 안 내부 모듈이라 ⛔ supports 아닌 provides(늘 있다). 계정 데이터는 레코드 노드라 nodes 필요.
        provides: { identity: '0.2.0', credential: '0.1.0', permit: '0.1.0' },
        requires: { nodes: '^0.1' },
        contributes: {
            // 🔴 약속 셋을 들고 온다(꾸러미 매니페스트). 켜진 account 가 호스트 약속 목록에 identity·credential·permit 를 올린다.
            interfaces: [
                { name: 'identity', version: '0.2.0', label: '로그인', desc: '지금 누가 들어와 있나' },
                { name: 'credential', version: '0.1.0', label: '비밀번호 확인', desc: '비밀번호가 맞는지 확인' },
                { name: 'permit', version: '0.1.0', label: '권한', desc: '무엇을 할 수 있나' },
            ],
            // 🔴 ⭐ 권한의 첫 본보기 — account 가 자기 노드 조작을 가릴 권한 낱말을 선언한다(보기·만들기·고치기·지우기 각각).
            //    호스트는 모으기만(장부 표시) · 누가 가지나는 사람이 「정책」에서 조립한다(바닥 정책 0 · ⛔ 역할 기본값 없음).
            permissions: [
                { id: 'account.users.view', title: '사용자 보기' },
                { id: 'account.users.create', title: '사용자 만들기' },
                { id: 'account.users.edit', title: '사용자 고치기' },
                { id: 'account.users.delete', title: '사용자 지우기' },
                { id: 'account.roles.view', title: '역할 보기' },
                { id: 'account.roles.create', title: '역할 만들기' },
                { id: 'account.roles.edit', title: '역할 고치기' },
                { id: 'account.roles.delete', title: '역할 지우기' },
                { id: 'account.policy.view', title: '정책 보기' },
                { id: 'account.policy.edit', title: '정책 고치기' },
            ],
            // 🔴 계정은 보이는 노드다 — 루트(싱글턴)·사용자 폴더·역할 폴더·사용자·역할·정책. 숨김 둘(프로젝트 암호·증명 비밀)은 record.
            nodeTypes: [...accountNodeTypes, ...accountSecretNodeTypes, ...credentialLocalNodeTypes],
            // 🔴 속성 칸 — 사용자·역할만(⛔ 비밀 노드는 값 노출이라 안 낸다)
            properties: [
                { target: USER_TYPE, id: 'user', title: '사용자', pane: 'AccountProps' },
                { target: ROLE_TYPE, id: 'role', title: '역할', pane: 'AccountProps' },
            ],
            // 노드를 누르면 열리는 편집 탭(가운데) — 지금 열린 노드의 종류에 맞는 편집기를 그린다(page-editor 와 같은 결).
            views: [{
                id: 'editor', title: '계정', icon: 'gear', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 360, squeeze: 'scroll' },
                component: 'Editor',
            }],
            // 프로젝트 암호만 설정에 남긴다(마스터용) — 사용자·역할·정책은 노드로 옮겨 설정에서 걷었다.
            settings: {
                sections: [{ id: 'account', title: '계정', icon: 'gear' }],
                items: [
                    { section: 'account', id: 'account.password', title: '프로젝트 암호', icon: 'key', pane: 'ProjectPassword' },
                ],
            },
            // 🔴 「지금 누구」 단추 — 상태바 오른쪽. 누르면 들어가기·나가기·사용자 바꾸기·계정 열기(AccountStatus).
            statusBar: [{ id: 'account.whoami', side: 'right', render: 'AccountStatus' }],
        },
    },

    // ── 편집 탭(가운데 뷰 · 이름으로 가리킴) ──
    components: {
        Editor: () => createElement(AccountEditor),
    },

    // ── 설정 패널 구현(이름으로 가리킴) — 프로젝트 암호만 ──
    panes: {
        ProjectPassword: () => createElement(ProjectPasswordPane),
        AccountProps,
    },

    // ── 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 이름이 가리킨다(open·can·canCreate·confirmDelete·hidden) ──
    nodeTypes: accountNodeTypeImpl,

    // ── 상태바 「지금 누구」 render(이름으로 가리킴) — 호스트가 첫 인자로 host 를 꽂는다 ──
    renders: {
        AccountStatus: (host: PluginHost) => createElement(AccountStatus, { host }),
    },

    // ── 모듈(provides 와 짝) — 누구·판정은 호출자별, 증명은 꾸러미 안 고정 모듈 ──
    modules: {
        identity: identityModule,
        permit: permitModule,
        credential: credentialModule,
    },

    lifecycle: {
        /** 노드 다리를 쥐고 세션을 시작 상태로 세운다(암호 유무가 정한다). 증명 부품의 노드 다리도 같이 쥔다. nodeTypes 등록은 applyContributes 가 끝냈다. */
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            core.initAccount(host, nodes ?? null);
            initCredentialLocal(host, nodes ?? null);   // 증명 부품도 같은 노드 다리를 받는다(꾸러미 안 내부 모듈)
        },
    },
});

export default accountPlugin;
