/** 문서 데모 신분증 — id 는 폴더명과 같아야 한다(구조 검사 ⑧). */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'doc-demo',
    name: '문서 데모',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '문서(host.doc) 왕복을 증명하는 메모 뷰 — 글자를 doc.plugins.doc-demo 에 저장하고 열기·저장 뒤 돌아온다',
};
