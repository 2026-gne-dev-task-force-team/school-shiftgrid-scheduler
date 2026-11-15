/**
 * 🔴 탭 한 칸의 폭 규칙. 사이드바 탭도 shrink-0 — 제 글자 폭만큼 잡고, 160px 를 넘는 긴 제목만 줄임표로 자른다.
 *    ⛔ 예전엔 min-w-0 shrink 라 닫기 ×(보이지 않아도 자리를 먹는다)·아이콘·여백을 뺀 나머지로 줄어
 *    밀도 「여유」·좁은 오른쪽 패널(약 280px)에서 탭이 둘뿐인데 「속..」「알..」로 잘렸다. 정말 모자라면 줄이 가로로 스크롤된다.
 */
export function tabWidthCls(sidebar: boolean): string {
    return sidebar ? 'max-w-[160px] shrink-0' : 'min-w-[96px] max-w-[200px] shrink-0';
}

