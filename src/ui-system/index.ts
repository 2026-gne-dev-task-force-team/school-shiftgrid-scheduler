/**
 * ui-system — UI 시스템(창틀 엔진). 패널·탭·사이드바·리본·테마가 사는 한 자리.
 *
 * 🔴 ⛔ 도메인 개념을 한 글자도 들이지 않는다.
 *    이 폴더는 다른 프로젝트에 통째로 떼어 갈 물건이다 — 쥔님 2026-10-31:
 *    *"이 UI 엔진은 평소에 잘 쓸 수 있을 것 같으니까 UI 폴더에 그대로 박지 말고 따로 폴더로 관리해줘."*
 *    (구조 검사가 실제로 막는다 — __tests__/structure.test.ts)
 *
 * ⭐ 바깥(features/)에서는 이 문 하나로만 들어온다: import { SidePanel, useTheme } from '../ui-system'
 *    ⛔ `ui-system/shell/SidePanel` 처럼 속을 직접 집어 쓰지 않는다 — 안을 바꿀 때 바깥이 깨진다.
 */

// 조각 — 뜻 없는 UI 부품. 색·치수를 쥐는 유일한 층이다
export { setStoragePrefix, storageKey } from './storage';

export { Surface } from './primitives/Surface';
export { IconButton } from './primitives/IconButton';
export { Row } from './primitives/Row';
export { SectionHeader } from './primitives/SectionHeader';
export { Icon, type IconName } from './primitives/Icon';

// 셸 — 자리 짜기. 내용은 모르고 자리만 안다
export { SidePanel } from './shell/SidePanel';
export { LeftSidebar } from './shell/LeftSidebar';
export { RightPanel } from './shell/RightPanel';
export { Rail } from './shell/Rail';
export { Tabs, type TabItem } from './shell/Tabs';
export { EditorArea } from './shell/EditorArea';

// 배치 — 폭·접힘·좁은 화면. 순수 계산 + 기기별 보관
export { useNarrow, usePanels, type Panels } from './layout/useScreen';
export type { PanelState } from './layout/panels';

// 테마 — 토큰 단일 원본 + 적용 + 설정
export { useTheme, type ThemeControls } from './theme/useTheme';
export { applyTheme, resolveMode, accentSwatchStyle, type ResolvedMode } from './theme/apply';
export {
    loadThemeSettings, saveThemeSettings, normalizeThemeSettings, defaultThemeSettings,
    type ThemeSettings, type ThemeMode,
} from './theme/settings';
export {
    COLOR_TOKENS, SIZE_TOKENS, ACCENTS, DENSITIES, findAccent,
    type ColorToken, type DensityId,
} from './theme/tokens';
