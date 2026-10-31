/**
 * 데모 「설정」 뷰 — 호스트 앱의 설정 화면을 그대로 띄운다.
 *
 * ⚠️ P0 임시 자리다 — 설정 화면을 「코어 플러그인 settings」로 뺄지는 노트 🙋1(쥔님 결정 대기).
 *    그때 이 뷰는 src/plugins/settings/ 로 가고, app/settings 로의 아래 import 가 사라진다.
 *    (그래서 지금은 plugins → app import 가 하나 있다 — 임시다.)
 */
import type { ViewProps } from '../../../pane-ui-system/plugin';
import { SettingsScreen } from '../../../app/settings/SettingsScreen';

export function SettingsView({ collapsed }: ViewProps) {
    // collapsed 는 창틀이 재서 준다(폭 < collapseBelow) — 설정 왼쪽 메뉴를 아이콘만으로 접는다
    return <SettingsScreen collapsed={collapsed} />;
}
