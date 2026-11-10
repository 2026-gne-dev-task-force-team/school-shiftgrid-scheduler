/**
 * pane-ui-system — UI 시스템(창틀 엔진). 패널·탭·사이드바·리본·테마가 사는 한 자리.
 *
 * 🔴 ⛔ 도메인 개념을 한 글자도 들이지 않는다.
 *    이 폴더는 다른 프로젝트에 통째로 떼어 갈 물건이다 — 쥔님 2026-10-31:
 *    *"이 UI 엔진은 평소에 잘 쓸 수 있을 것 같으니까 UI 폴더에 그대로 박지 말고 따로 폴더로 관리해줘."*
 *    (구조 검사가 실제로 막는다 — __tests__/structure.test.ts)
 *
 * ⭐ 바깥(features/)에서는 이 문 하나로만 들어온다: import { SidePanel, useTheme } from '../pane-ui-system'
 *    ⛔ `pane-ui-system/shell/SidePanel` 처럼 속을 직접 집어 쓰지 않는다 — 안을 바꿀 때 바깥이 깨진다.
 */

// 조각 — 뜻 없는 UI 부품. 색·치수를 쥐는 유일한 층이다
export { setStoragePrefix, storageKey } from './storage';
// 큰 자료용 보관 — IndexedDB(origin 당 5MB 천장 회피). 작은 설정은 host.storage(localStorage) 그대로.
export { kvGet, kvSet, kvDel, kvEstimate, kvAvailable } from './kv';
export { onStorageKey } from './cross-tab';
// 클립보드 TSV 해석·만들기 — 표 편집기·레코드 뷰가 한 벌을 쓴다(순수 함수)
export { parseClipboard, toTsv } from './clipboard-tsv';
// 창틀 동작의 명령 id — 창틀이 이름을 쥐고 앱이 run 을 꽂는다(「모든 동작은 명령」)
export { FRAME_COMMAND, viewOpenCommandId, isSidePanelView, type FrameCommandId } from './frame-commands';
// 되돌리기 공용 더미 + ⌘Z 판정 — 범위(더미)는 쓰는 쪽마다 따로 든다
export { emptyHistory, record, undo, redo, canUndo, canRedo, undoKey, latinKey, type History } from './history';
// 플랫폼 키 — 수정키 판정·표기의 유일한 자리(맥 ⌘ / 윈도우 Ctrl)
export { isMod, isAlt, isMacPlatform, keyLabel, modClickLabel, platform, setPlatform, type Platform } from './platform-keys';
// 단축키 — 명령의 keys + 사용자 재지정 → 전역 디스패처 하나
export {
    installKeybindings, handleKeydown, eventToKey, normalizeKey, formatKey, effectiveKey, keyMap,
    getKeyOverrides, setKeyOverride, resetKeyOverride, resetAllKeyOverrides, restoreKeyOverrides, useKeyOverrides, type KeyOverrides,
} from './keybindings';

export { FOCUS_RING, pressProps, focusWhenReady } from './primitives/focus';
export { Button } from './primitives/Button';
export { Surface } from './primitives/Surface';
export { IconButton } from './primitives/IconButton';
export { BottomSheet } from './primitives/BottomSheet';
export { Row } from './primitives/Row';
export { SectionHeader } from './primitives/SectionHeader';
export { Icon, type IconName } from './primitives/Icon';
export { StartScreen, type StartItem } from './primitives/StartScreen';
export { uniqueName } from './primitives/naming';
export { ContextMenu, type MenuEntry, type MenuGroup } from './primitives/ContextMenu';
export { MenuList, MenuItem, MenuSeparator, handleMenuKey } from './primitives/Menu';
export { EmptyState } from './primitives/EmptyState';
export { InlineRename } from './primitives/InlineRename';
export { useFrameToolbar, FrameToolbarPortal, type FrameToolbar } from './primitives/FrameToolbar';
export { isImeEnter } from './primitives/ime';
export { josa, pickJosa, batchim, type JosaPair } from './primitives/josa';
export { DatePicker } from './primitives/DatePicker';
export { DateField } from './primitives/DateField';
export { Popover } from './primitives/Popover';
export { Tooltip } from './primitives/Tooltip';
export { PropertyField } from './primitives/PropertyField';
export { IconPicker, IconPickerPopover, TitleField, TITLE_FIELD, COMMON_EMOJI } from './primitives/IconPicker';
export { NodeIcon } from './node-icon/NodeIcon';
export { NodeIconPanel } from './node-icon/NodeIconPicker';
export {
    parseNodeIcon, serializeNodeIcon, NODE_ICON_COLORS,
    type NodeIconValue, type NodeIconColor,
} from './node-icon/model';
export { addIconPack, listIconPacks, useIconPacks, type IconPackContribution, type IconPackIcon } from './node-icon/packs';
export { sanitizeSvg, safeImageUrl } from './node-icon/svg-sanitize';
export { Toggle } from './primitives/Toggle';
export { Dialog } from './primitives/Dialog';
export { ConfirmDialog } from './primitives/ConfirmDialog';
export { Toolbar } from './primitives/Toolbar';
export { usePeekBar } from './shell/shared/peek-bar';
export { ViewHeader } from './primitives/ViewHeader';
export { TextInput } from './primitives/TextInput';
export { Select } from './primitives/Select';
export { Pill } from './primitives/Pill';
export { PILL_COLORS, pillStyle, type PillColor } from './primitives/pill-colors';

// 상호작용 — 🔴 드래그·길게누르기·포인터 제스처·전역 가드·재배열 훅이 사는 자리(쥔님: *"인터렉티브 폴더 따로"*).
//   ⛔ layout/ · primitives/ 는 포인터 핸들러를 직접 안 든다 — 전부 여길 거친다(구조 검사가 지킨다).
export {
    useContextTrigger, useDragLeaf, useReorder,
    SELECTABLE_SELECTOR, installContextMenuGuard,
    paneZone, tabDropSide, EDGE_BAND,
    type DragLeafState, type DragBind, type DragAxis, type ReorderOpts,
    type PaneZone, type Rect,
} from './interactive';
export { monthGrid, shiftMonth, monthLabel, isoOf, addDays, startOfWeek, weeksBetween, weekRow, type DayCell } from './primitives/date-grid';

// 🔴 레코드 뷰(노션 표 보기를 본뜬 목록 화면 부품)는 2026-11-08 collection 꾸러미(src/plugins/collection)로 내려갔다.
//    창틀 엔진은 도메인 없는 자리라 목록 화면 부품을 품지 않는다 — 손님은 host.modules.use<RecordViewApi>('collection') 로 받는다.

// 셸 — 자리 짜기. 내용은 모르고 자리만 안다.
//   ⭐ 2026-11-01: 화면 전용 조각을 폴더로 갈랐다(쥔님). shared/ 공통 · desktop/ 넓은 화면 전용 · mobile/ 좁은 화면 전용.
//      구조 검사가 desktop ↔ mobile 서로 import 0 을 지킨다.
export { SidePanel } from './shell/shared/SidePanel';
export { Tabs, type TabItem } from './shell/shared/Tabs';
export { EditorArea } from './shell/shared/EditorArea';
export { ViewErrorBoundary, RootErrorBoundary, healLayoutStorage } from './shell/shared/ErrorBoundary';
export { EmptyArea } from './shell/shared/EmptyArea';
export { WorkspaceView, type WorkspaceHandlers, type TabButtons, type RootChrome, type CenterEdges } from './shell/shared/WorkspaceView';
export { DropZones } from './shell/shared/DropZones';
export { resolveDropAt, type DropMove, type DropResolution, type DropPreview, type DropBox } from './shell/shared/drop-resolve';
export { TitleBar, type TitleAction } from './shell/shared/TitleBar';
export { StatusBar, type StatusItem } from './shell/shared/StatusBar';
export { StorageErrorStatus } from './shell/shared/StorageErrorStatus';
export { Toasts } from './shell/shared/Toasts';
export { NotifyStatus } from './shell/shared/NotifyStatus';
export { NotifyPanel } from './shell/shared/NotifyPanel';
export { storageStatusKind, type StorageStatusKind } from './shell/shared/storage-status';
export { CommandPalette } from './shell/shared/CommandPalette';
// 넓은 화면 전용(desktop)
export { Rail } from './shell/desktop/Rail';
// 좁은 화면 전용(mobile)
export { BottomBar, type BarItem } from './shell/mobile/BottomBar';
export { TabSwitcher } from './shell/mobile/TabSwitcher';
export { RibbonSheet } from './shell/mobile/RibbonSheet';

// 배치 — 폭·접힘·좁은 화면. 순수 계산 + 기기별 보관
export { useNarrow, usePanels, type Panels } from './layout/useScreen';
export type { PanelState } from './layout/panels';
export {
    SWIPE_EDGE, SWIPE_DEADZONE, SWIPE_SNAP, SHEET_SNAPS, SHEET_CLOSE_BELOW,
    classifySwipe, edgeStart, swipeProgress, settleOpen, splitBarItems, sheetSnap, type SwipeAxis,
} from './layout/mobile';

// 폭 가두기 + 뷰 레이아웃 힌트 — 순수 계산(상수는 설정에서 온다)
export {
    effectiveMin, clampWidthTo, isCollapsed, mergeLayout, clampSplitPair,
    type ViewLayout, type Squeeze,
} from './layout/clamp';

// 창틀 설정 — 사이드바·탭·좁은 화면 기준폭 + 뷰별 덮어쓰기. 기기별 보관 + 외부 스토어
export {
    usePaneSettings, setPaneSettings, snapshotPaneStore, restorePaneStore, setViewOverride, resetPaneSettings, resetViewOverrides,
    effectiveViewLayout, getViewOverride,
    defaultPaneSettings, normalizePaneSettings, normalizeViewOverrides,
    defaultRibbon, normalizeRibbon, resolveRibbon, reorderIds, nudgeId,
    setRibbonOrder, toggleRibbonHidden, resetRibbon, getRibbon, getPaneSettings,
    type PaneSettings, type ViewOverrides, type Ribbon,
} from './layout/pane-settings';

// 패널 트리 모델 — 「무엇이 어디 있나」. React 0줄 · 순수 연산
export {
    type Workspace, type Node, type Leaf, type TabsNode, type SplitNode, type AreaKey, type MovePos,
    leaf, tabs, split, uid, emptyWorkspace, emptyTabs, normalize,
    openLeaf, closeLeaf, activateLeaf, moveLeaf, moveTabWithin, splitAt, resize, addLeafToTabs,
    closeOthers, closeToRight, areaOfLeaf, renameLeaf, withLeafGlyph,
    findLeaf, findLeafByView, findLeafByViewParams, firstTabs, lastTabs, flatten, sizesFor, MIN_FRACTION,
} from './layout/tree';
export { loadWorkspace, saveWorkspace, hasWorkspace, clearWorkspace, normalizeRaw, workspaceKey } from './layout/workspace-store';

// 뷰 등록소 — 🔴 ⛔ 등록·조회 함수는 이 문으로 내보내지 않는다(registerView·getView·listViews·…).
//    바깥(앱·플러그인)은 host 로만 등록·조회한다 — 「주인 없는 등록」이 생길 구멍을 막는다.
//    (창틀 안쪽 셸·배치는 '../view-registry' 를 직접 쓴다 — 같은 폴더라 문을 거칠 필요가 없다.)
//    타입은 내보낸다 — 호스트가 돌려주는 값을 바깥이 타이핑해야 한다.
export {
    type ViewDef, type ViewProps, type ViewMenu, type ViewMenuHost, type PeekHandle,
} from './view-registry';

// 테마 — 토큰 단일 원본 + 적용 + 설정
export { useTheme, getThemeSettings, type ThemeControls } from './theme/useTheme';
export { applyTheme, resolveMode, effectiveColors, themeSwatchStyle, type ResolvedMode } from './theme/apply';
export {
    loadThemeSettings, saveThemeSettings, normalizeThemeSettings, defaultThemeSettings, INDENTS, indentPx,
    type ThemeSettings, type ThemeMode,
} from './theme/settings';
export {
    COLOR_TOKENS, SIZE_TOKENS, THEMES, DENSITIES, FONT_SIZES, densityScale, fontScale, findTheme,
    type ColorToken, type DensityId, type FontSizeId, type ThemePreset, type Palette,
} from './theme/tokens';
export { hexToRgb, rgbToHex, isTriplet } from './theme/color';
export {
    useUserThemes, addUserTheme, removeUserTheme, restoreUserTheme, renameUserTheme,
    exportThemeJSON, importThemeJSON, normalizeUserThemes,
    type UserTheme, type ImportResult,
} from './theme/user-themes';

// 공통 부품 U-부품b — 입력류 새 부품 + 모서리 토큰
export { Field } from './primitives/Field';
export { Textarea } from './primitives/Textarea';
export { NumberInput } from './primitives/NumberInput';
export { Checkbox } from './primitives/Checkbox';
export { Segmented } from './primitives/Segmented';
export { RadioGroup } from './primitives/RadioGroup';
export { Badge } from './primitives/Badge';
export { RADIUS_TOKENS, type RadiusToken } from './theme/tokens';
