/**
 * v2 작업대 진입점 — 2026-10-31 레이아웃 껍데기부터 새로 짓는다.
 * 기능 0 · 내용 0 — 창틀(사이드바 두 칸·오른쪽 패널·가운데 탭)만 돈다.
 *
 * 🔴 증명 입력창(CredentialDialog)만 여기서 전역으로 마운트한다 — Contributes 엔 전역 오버레이 기여점이 없고
 *    (뷰·설정·상태바뿐), 모달은 상태바가 숨겨져도 떠야 하므로 상태바 기여로는 못 건다. 그래서 조립 루트(App)에
 *    한 번 끼운다(plugins.ts 가 플러그인을 값으로 들이는 것과 같은 층). 요청이 없으면 null 을 그려 아무 것도 안 띄운다.
 *    ⛔ 약속 이름을 문자열 리터럴로 쓰지 않는다 — 부품(컴포넌트)만 가져온다(구조 검사 ⑱-f).
 */
import { RootErrorBoundary } from '../pane-ui-system'
import { Workbench } from './Workbench'
import { CredentialDialog } from '../plugins/account'
import { EditionBadge } from './EditionBadge'

export default function App() {
  return (
    <RootErrorBoundary>
      <Workbench />
      <CredentialDialog />
      <EditionBadge />
    </RootErrorBoundary>
  )
}
