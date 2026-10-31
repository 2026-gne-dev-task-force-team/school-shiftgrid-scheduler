/**
 * 플러그인 배럴 — 🔴 플러그인(src/plugins/**)은 이 문 하나로만 창틀에 들어온다(구조 검사 ⑥).
 *    ⛔ pane-ui-system/shell·layout·primitives 속을 직접 집지 않는다 — 안을 바꿀 때 플러그인이 깨진다.
 *
 * 여기로 내보내는 것: 매니페스트·호스트 타입 + 뷰·메뉴 타입 + 활성·다리.
 */
export type { ViewDef, ViewProps, ViewMenu, ViewMenuHost } from '../view-registry';
export type { IconName } from '../primitives/Icon';
export type { MenuEntry } from '../primitives/ContextMenu';

export type {
    PluginManifest, PluginModule, PluginHost, Disposable,
    RibbonAction, CommandDef, SettingsContribution, WorkspaceOpenOptions,
} from './types';
export { HOST_VERSION } from './types';

export { makeHost } from './host';
export { activateAll } from './registry';
export {
    setWorkspaceBridge, disposeOwner, listRibbonActions,
    type WorkspaceBridge,
} from './store';
