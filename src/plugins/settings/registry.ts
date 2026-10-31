/**
 * 설정 Pane 공용 타입 — 🔴 섹션·항목은 이제 상수가 아니라 기여 스토어다(index.ts 의 activate 가 host.settings 로 꽂는다).
 *   ⭐ 새 설정 항목을 더하는 비용은 "Pane 파일 하나 + activate 한 줄" 이다(쥔님: *"설정 때려박지 말고 유형별로"*).
 *
 * 뷰·리본 Pane 은 플러그인의 host(뷰 목록·리본 조회 창구)가 필요해 이 props 를 받는다.
 * 모양 Pane 은 테마를 스스로 쥔다(useTheme) · 패널 Pane 은 아무것도 안 받는다 — 각자 자족한다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';

export interface SettingsPaneProps {
    host: PluginHost;
}
