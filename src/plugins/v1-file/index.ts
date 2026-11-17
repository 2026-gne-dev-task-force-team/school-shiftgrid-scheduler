/**
 * 「v1 파일 호환」 플러그인 — 경계 조각(1.2v 편성기 분해 F10 · 설계 3-4).
 *   F10a: 불러오기 순수 함수만(./import-v1). 화면·명령 연결은 정본 약속이 쓰기를 내줄 때 붙인다 · 내보내기는 F10b.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';

export const v1FilePlugin = definePlugin({ manifest: { ...manifest, contributes: {} } });

export default v1FilePlugin;
