/**
 * ③ F3 — 서버 모드에서 로컬 account 를 끈다(「지금 누구」 단추가 둘 서지 않게). 로컬 모드는 목록 그대로(활성 골든 무변경).
 */
import { describe, it, expect } from 'vitest';
import { PLUGINS, pluginIdsFor } from './plugins';
import { INSTALLED_PLUGIN_IDS } from './site-config';
import { isServerMode } from '../plugins/account-server';

describe('서버 모드 — 옛 account 끄기', () => {
    it('서버 모드면 account 만 빠지고 account-server 는 남는다 · 로컬 모드면 그대로', () => {
        const server = pluginIdsFor(INSTALLED_PLUGIN_IDS, isServerMode({ supabaseUrl: 'https://example.test', anonKey: 'fake-anon' }));
        expect(server).not.toContain('account');
        expect(server).toContain('account-server');
        expect(INSTALLED_PLUGIN_IDS.filter((id) => !server.includes(id))).toEqual(['account']);
        expect(pluginIdsFor(INSTALLED_PLUGIN_IDS, isServerMode({ supabaseUrl: '', anonKey: '' }))).toEqual(INSTALLED_PLUGIN_IDS);
    });
    it('지금 site.config(빈 칸)는 로컬 모드 — 설치 목록에 account 가 있다', () => {
        expect(PLUGINS.map((p) => p.manifest.id)).toContain('account');
    });
});
