/**
 * 플러그인 배럴 — 🔴 플러그인(src/plugins/**)은 이 문 하나로만 창틀에 들어온다(구조 검사 ⑥).
 *    ⛔ pane-ui-system/shell·layout·primitives 속을 직접 집지 않는다 — 안을 바꿀 때 플러그인이 깨진다.
 *
 * 여기로 내보내는 것: 매니페스트·호스트 타입 + 뷰·메뉴 타입 + 활성·다리 + 기여 스토어 조회(창틀 셸·앱이 읽는다).
 */
export type { ViewDef, ViewProps, ViewMenu, ViewMenuHost, PeekHandle } from '../view-registry';
export type { IconName } from '../primitives/Icon';
export type { MenuEntry } from '../primitives/ContextMenu';

export type {
    PluginManifest, PluginAbout, PluginModule, PluginHost, Disposable,
    RibbonAction, RibbonAddInput, CommandDef, CommandContext, SettingsContribution, StatusContribution,
    TabMenuContext, WorkspaceEvent, WorkspaceLeafInfo, WorkspaceOpenOptions,
    // 🔴 선언형 기여(2026-11-02 선언형 전환) — 매니페스트 contributes · 모듈 구현 칸 · 동적 선언
    Contributes, ViewContribution, CommandContribution, SettingsContributes, StatusBarContribution,
    PropertiesContribution, PropertiesTarget, PropertiesPaneProps,
    NodeTypeContribution, NodeTypeRegistrar,
    PluginImpl, PerCallerApi, PluginLifecycle, DeclareInput,
    ContributionKind, ContributionRecord,
    // 🔴 M0 모듈·의존성 — 약속(인터페이스) 기여 선언 · supports 훅
    InterfaceContribution, InterfaceHook,
} from './types';
export { HOST_VERSION } from './types';
export { HOST_SERVICES, type HostService } from './host-services';

export { definePlugin } from './define';
export { makeHost, resetFirstRunFlags } from './host';
export {
    activateAll, enablePlugin, disablePlugin, listPlugins, ownerOfView, usePluginRegistry,
    dependentsOf, disableImpact, attachmentsOf, consumersOf, listInterfaces,
    type PluginStatus, type InterfaceStatus, type ImpactItem, type DisableImpact,
} from './registry';
export { ViewPlaceholder } from './Placeholder';
export {
    setWorkspaceBridge, setLeafTitle, setLeafGlyph, disposeOwner, listRibbonActions,
    useContribVersion, useStatusItems, listStatusItems,
    listSettings, listCommands, getCommand, runCommand, listTabMenu, getNewTab, fireWorkspace,
    listContributions, listPropertiesPanes,
    type PropertiesEntry,
    type SettingsSectionEntry, type SettingsItemEntry, type StatusEntry, type NewTabContribution,
    type WorkspaceBridge,
} from './store';
export { resolveRibbonEntries, ribbonBase, type RibbonEntry } from './ribbon';
export {
    reportStorageError, clearStorageErrors, useStorageErrors, listStorageErrors, classifyStorageError,
    setDurability, getDurability, useDurability,
    type StorageError, type StorageErrorReason, type StorageDurability,
} from './storage-errors';
export {
    notify, dismiss as dismissNotify, runNotifyAction, markAllRead, clearNotifications, applyNotifyRetain,
    useNotifications, getNotifications,
    type NotifyInput, type NotifyItem, type NotifyLevel, type NotifyAction, type NotifySnapshot,
} from './notify';
