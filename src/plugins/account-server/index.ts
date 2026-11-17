/**
 * 「서버 계정」 꾸러미(③ F2 · 10절) — 로컬 account 와 **같은 약속 셋**(identity 0.2 · permit 0.1 · credential 0.1)을 서버 쪽으로 채운다.
 *   🔴 서버 모드에서만 제공한다 — site.config.json 의 supabaseUrl·anonKey 가 둘 다 있을 때(server-link 「미설정」 판정과 같은 꼴).
 *      비면(로컬 모드) provides·화면 기여 0 — 켜져 있어도 아무것도 안 채우고 로컬 account 가 그대로 돈다.
 *      켜지면 목록에서 account 보다 앞이라 같은 약속의 제공자 승자가 된다(진 쪽 account 는 registry 의 standby).
 *   🔴 클라이언트는 server-link 가 만든 것을 빌린다(requires server-link) — ⛔ 여기서 createClient·fetch.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, Disposable, PerCallerApi } from '../../pane-ui-system/plugin';
import type { Identity } from '../account/contracts/identity';
import type { Permit } from '../account/contracts/permit';
import type { Credential } from '../account/contracts/credential';
import type { ServerConfig, ServerLink } from '../server-link/contracts/server-link';
import config from '../../../site.config.json';
import { manifest } from './manifest';
import { createAccountServer, type AuthClient } from './session';
import { ServerAccountStatus } from './panes/ServerAccountStatus';
import { MembersPane } from './members/MembersPane';
import { createMembersApi, type MembersClient } from './members/api';
import { createPasswordKit, PASSWORD_CMD } from './password';

/** server-link 의 isConfigured 와 같은 판정(값 import 는 꾸러미 경계 위반이라 여기 한 줄로). */
export function isServerMode(c: ServerConfig | undefined): boolean {
    return !!c && typeof c.supabaseUrl === 'string' && c.supabaseUrl.trim() !== ''
        && typeof c.anonKey === 'string' && c.anonKey.trim() !== '';
}
const SERVER_MODE = isServerMode(config as ServerConfig);

let link: ServerLink | null = null;
let linkSub: Disposable | null = null;

export const accountServer = createAccountServer({
    getClient: () => (link?.client() as AuthClient | null | undefined) ?? null,
    classify: (e) => (link ? link.classify(e) : { kind: 'network' }),
});
/** 비밀번호 판(③ F4·F6) — 비번 바꾸기·재설정 메일·재설정 링크 착지. */
export const passwordKit = createPasswordKit(accountServer);

// F3 — 구성원·초대 판. 같은 server-link 클라이언트를 빌린다(⛔ createClient·fetch).
export const membersApi = createMembersApi({
    getClient: () => (link?.client() as MembersClient | null | undefined) ?? null,
    classify: (e) => (link ? link.classify(e) : { kind: 'network' }),
});
export const MEMBERS_VIEW = 'account-server.members';

function perCaller<T>(make: (track?: (d: Disposable) => Disposable) => T): PerCallerApi<T> {
    const fn = (_callerId: string | undefined, track?: (d: Disposable) => Disposable) => make(track);
    (fn as unknown as { __perCaller: true }).__perCaller = true;
    return fn as unknown as PerCallerApi<T>;
}

const identityModule = perCaller<Identity>((track) => ({
    current: () => accountServer.current(),
    onChange: (fn) => { const d = accountServer.onIdentityChange(fn); return track ? track(d) : d; },
}));

const permitModule = perCaller<Permit>((track) => ({
    can: (permission) => accountServer.can(permission),
    // 판정은 신분에만 달렸다 — 사람이 바뀔 때 같이 울린다.
    onChange: (fn) => { const d = accountServer.onIdentityChange(fn); return track ? track(d) : d; },
}));

const credentialModule: Credential = {
    methods: () => accountServer.methods(),
    challenge: (methodId, userId) => accountServer.challenge(methodId, userId),
};

export const accountServerPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: SERVER_MODE ? { identity: '0.2.0', credential: '0.1.0', permit: '0.1.0' } : {},
        requires: { 'server-link': '^0.1' },
        contributes: SERVER_MODE ? {
            statusBar: [
                { id: 'account-server.whoami', side: 'right', render: 'ServerAccountStatus' },
                { id: 'account-server.password', side: 'right', render: 'PasswordDialogs' },
            ],
            views: [{ id: 'members', title: '구성원·초대', icon: 'users', defaultArea: 'center', placement: { areas: ['center'], singleton: true }, component: 'Members' }],
            commands: [
                { id: 'account-server.members.open', title: '구성원·초대 열기', icon: 'users' },
                { id: PASSWORD_CMD.change, title: '비밀번호 바꾸기', icon: 'key', keywords: ['암호', '비번'] },
                { id: PASSWORD_CMD.reset, title: '비밀번호 재설정 메일 보내기', icon: 'key', keywords: ['암호', '비번', '잊음'] },
            ],
        } : {},
    },
    components: {
        Members: () => createElement(MembersPane, { session: accountServer, api: membersApi }),
    },
    renders: {
        ServerAccountStatus: (host: PluginHost) => createElement(ServerAccountStatus, { session: accountServer, run: (id) => { host.commands.run(id); } }),
        PasswordDialogs: (_host: PluginHost) => passwordKit.render(),
    },
    commands: {
        'account-server.members.open': (host: PluginHost) => { host.workspace.open(MEMBERS_VIEW, { where: 'center' }); },
        [PASSWORD_CMD.change]: () => passwordKit.ui.open('change'),
        [PASSWORD_CMD.reset]: () => passwordKit.ui.open('reset'),
    },
    modules: {
        identity: identityModule,
        permit: permitModule,
        credential: credentialModule,
    },
    lifecycle: {
        onActivate(host: PluginHost) {
            if (!SERVER_MODE) return;
            link = host.modules.use<ServerLink>('server-link') ?? null;
            linkSub = link?.onChange((s) => { void accountServer.linkChanged(s); }) ?? null;
            if (link) void accountServer.linkChanged(link.status());
            passwordKit.start(link);
        },
        onDeactivate() {
            linkSub?.dispose();
            linkSub = null;
            link = null;
            passwordKit.stop();
        },
    },
});

export default accountServerPlugin;
