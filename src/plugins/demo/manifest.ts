/** 데모 플러그인 신분증 — id 는 폴더명과 같아야 한다(구조 검사 ⑧). */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'demo',
    name: '데모',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '창틀을 시험하는 데모 뷰 묶음 — 표·설정·개요·속성',
};
