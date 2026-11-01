/**
 * 「팬 UI 엔진 테스트」 설정 Pane — 설정 섹션 기여점을 자기 몸으로 증명한다(쥔님: 설정 섹션도 써 본다).
 *   지금은 하네스 설명만 — 피크 넓음/좁음 가름 폭(설정으로 뺀 값)은 단계 4 에서 여기 붙는다.
 */
export function PaneTestSettings() {
    return (
        <div className="flex flex-col gap-3 max-w-[560px] text-[13px] text-text">
            <p className="text-muted">
                이 플러그인은 창틀(pane-ui-system)을 눈으로 시험하는 하네스입니다. 리본의 ✨ 아이콘으로 시험 탭을 엽니다.
            </p>
            <p className="text-muted">
                시험 탭 안의 단추로 패널·탭·스크롤·피크를 열어, 가르기·사이드바 이동·드래그·스크롤이 제대로 도는지 봅니다.
            </p>
        </div>
    );
}
