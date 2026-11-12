/**
 * 「시간표 짜기(편성)」 신분증 — v1 편성 화면을 legacy/ 사본 iframe 으로 띄운다(설계 ① 2-1 · P10a). id 는 폴더명과 같다(구조 검사 ⑧).
 * ⚠️ 아직 site.config.json·app/plugins.ts 에 안 올렸다 — 노드 붙임(v1-editor.edit)과 platform 교체(P10b)가 끝난 뒤 올린다.
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'v1-editor',
    name: '시간표 짜기',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'table',
    description: '기존 시간표 편성 화면을 그대로 띄웁니다.',
    about: {
        what: '기존(v1) 시간표 편성 화면 일곱 개를 한 판 안에서 그대로 씁니다. 순서 없이 아무 화면부터 써도 됩니다.',
        use: ['시간표를 새로 짜거나 고칠 때'],
        off: '편성 화면만 사라집니다. 저장된 시간표는 그대로입니다.',
        with: '화면은 같은 출처의 별도 창(iframe)에 뜹니다.',
    },
};
