/**
 * 「서버 연결」 꾸러미(③ F1 · ② B17) — 약속 server-link 를 들고 와(contributes.interfaces) 채운다(provides).
 *   화면 없음 — onActivate 에 클라이언트를 만들고 세션 구독을 걸며, onDeactivate 에 다 푼다.
 *   설정은 루트 site.config.json 의 supabaseUrl·anonKey(비면 「서버 미설정」으로 조용히).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import config from '../../../site.config.json';
import type { ServerConfig } from './contracts/server-link';
import { manifest } from './manifest';
import { createServerLink } from './link';

const SERVER: ServerConfig = {
    supabaseUrl: (config as ServerConfig).supabaseUrl,
    anonKey: (config as ServerConfig).anonKey,
};

export const serverLink = createServerLink(SERVER);

export const serverLinkPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { 'server-link': '0.1.0' },
        contributes: {
            interfaces: [{ name: 'server-link', version: '0.1.0', label: '서버 연결', desc: 'Supabase 클라이언트·로그인 상태·끊김 갈래·바뀜 폴링' }],
        },
    },
    modules: { 'server-link': serverLink },
    lifecycle: {
        // 실패해도 앱은 로컬로 돈다 — 상태가 loading 에 머물 뿐 활성은 막지 않는다.
        onActivate() { void serverLink.start().catch(() => { /* 서버 없이 계속 */ }); },
        onDeactivate() { serverLink.dispose(); },
    },
});

export default serverLinkPlugin;
