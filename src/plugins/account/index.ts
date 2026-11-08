/**
 * 「계정」 플러그인 — 갈아 끼는 자리 셋 중 「누구(identity)·판정(permit)」을 채우고 「증명(credential)」을 지원한다.
 *   🔴 바닥 정책 0(쥔님 2026-11-08 14:54) — 역할 이름·권한 기본값·처음 상태를 박지 않는다. 블록(길 셋)만 내주고 정책은 화면에서 사람이 건다.
 *   ⭐ 유일하게 바닥이 아는 상태는 마스터(프로젝트 만든 사람 · 체계 밖 수정자). 암호 없으면 마스터로 시작, 걸면 손님으로 시작.
 *
 * 선언형 전환: 설정 패널·노드 타입을 contributes 로 적고, 모듈(identity·permit)은 호출자별 팩토리로 내놓는다(소비자 구독이 scope 에 모인다).
 *   🔴 import type 만 — 약속 타입은 contract-* 의 types 에서(값은 host.modules.use). provides·supports·requires 는 약속 **이름**에만 건다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, Disposable, PerCallerApi } from '../../pane-ui-system/plugin';
import type { Identity } from '../contract-identity/types';
import type { Permit } from '../contract-permit/types';
import type { NodesApi } from '../contract-nodes/types';
import { manifest } from './manifest';
import { accountNodeTypes } from './nodes';
import * as core from './core';
import { UsersPane } from './panes/UsersPane';
import { RolesPane } from './panes/RolesPane';
import { PolicyPane } from './panes/PolicyPane';
import { ProjectPasswordPane } from './panes/ProjectPasswordPane';
import { AccountStatus } from './panes/AccountStatus';

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
        // 🔴 누구·판정을 채운다 · 증명은 지원(⛔ requires 아님 — 증명 제공자 0이어도 켜진다) · 계정 데이터는 레코드 노드라 nodes 필요.
        provides: { identity: '0.2.0', permit: '0.1.0' },
        supports: { credential: '^0.1' },
        requires: { nodes: '^0.1' },
        contributes: {
            // 계정 데이터(사용자·역할·정책·암호 해시) — record 노드라 탐색기에 안 보인다.
            nodeTypes: accountNodeTypes,
            // 정책 편집 화면을 설정에 꽂는다 — 섹션 account · 항목 넷(id 는 전역 평면이라 스스로 접두).
            settings: {
                sections: [{ id: 'account', title: '계정', icon: 'gear' }],
                items: [
                    { section: 'account', id: 'account.users', title: '사용자', icon: 'book', pane: 'Users' },
                    { section: 'account', id: 'account.roles', title: '역할', icon: 'layers', pane: 'Roles' },
                    { section: 'account', id: 'account.policy', title: '정책', icon: 'check', pane: 'Policy' },
                    { section: 'account', id: 'account.password', title: '프로젝트 암호', icon: 'pin', pane: 'ProjectPassword' },
                ],
            },
            // 🔴 「지금 누구」 단추 — 상태바 오른쪽. 누르면 들어가기·나가기·사용자 바꾸기(AccountStatus).
            statusBar: [{ id: 'account.whoami', side: 'right', render: 'AccountStatus' }],
        },
    },

    // ── 설정 패널 구현(이름으로 가리킴) ──
    panes: {
        Users: () => createElement(UsersPane),
        Roles: () => createElement(RolesPane),
        Policy: () => createElement(PolicyPane),
        ProjectPassword: () => createElement(ProjectPasswordPane),
    },

    // ── 상태바 「지금 누구」 render(이름으로 가리킴) — 호스트가 첫 인자로 host 를 꽂는다 ──
    renders: {
        AccountStatus: (host: PluginHost) => createElement(AccountStatus, { host }),
    },

    // ── 모듈(provides 와 짝) — 누구·판정을 호출자별로 내준다 ──
    modules: {
        identity: identityModule,
        permit: permitModule,
    },

    lifecycle: {
        /** 노드 다리를 쥐고 세션을 시작 상태로 세운다(암호 유무가 정한다). nodeTypes 등록은 applyContributes 가 끝냈다. */
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            core.initAccount(host, nodes ?? null);
        },
    },
});

export default accountPlugin;
