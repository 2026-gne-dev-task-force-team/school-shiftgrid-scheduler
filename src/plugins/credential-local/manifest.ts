/**
 * 「credential-local」 신분증 — 증명 제공자(이름+암호). id 는 폴더명과 같다(구조 검사 ⑧).
 *   제공: credential · 필요: nodes(비밀 해시를 레코드 노드로).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'credential-local',
    name: '증명: 이름+암호',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '증명 제공자 — 이름+암호 한 방법. 비밀은 해시로 레코드 노드에(사용자 목록과 분리). 입력창을 스스로 띄운다.',
};
