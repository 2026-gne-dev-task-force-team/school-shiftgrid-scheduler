/**
 * 약속 플러그인 「contract-export」 — export 약속 한 장만 선언한다(모듈 0 · 화면 0). uses 없음(학교 낱말을 모른다).
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const contractExportPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: { interfaces: [{ name: 'export', version: '0.1.0', label: '인쇄·PDF·엑셀' }] },
    },
});
export default contractExportPlugin;
