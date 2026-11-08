/**
 * 「credential-local」 플러그인 — 갈아 끼는 자리 「증명(credential)」을 채운다(이름+암호 한 방법).
 *   🔴 입력 화면은 스스로 띄운다(CredentialDialog) — 약속으로 비밀번호를 주고받지 않는다. 비밀 해시는 제 레코드 노드에.
 *   🔴 import type 만 — 약속 타입은 contract-* 의 types 에서(값은 host.modules.use). provides·requires 는 약속 이름에만.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Credential } from '../contract-credential/types';
import type { NodesApi } from '../contract-nodes/types';
import { manifest } from './manifest';
import { credentialLocalNodeTypes } from './nodes';
import * as core from './core';

export { CredentialDialog } from './CredentialDialog';

const credentialModule: Credential = {
    methods: () => core.methods(),
    challenge: (methodId, userId) => core.challenge(methodId, userId),
};

export const credentialLocalPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { credential: '0.1.0' },
        requires: { nodes: '^0.1' },
        contributes: {
            nodeTypes: credentialLocalNodeTypes,
        },
    },

    modules: {
        credential: credentialModule,
    },

    lifecycle: {
        onActivate(host: PluginHost) {
            const nodes = host.modules.use<NodesApi>('nodes');
            core.initCredentialLocal(host, nodes ?? null);
        },
    },
});

export default credentialLocalPlugin;
