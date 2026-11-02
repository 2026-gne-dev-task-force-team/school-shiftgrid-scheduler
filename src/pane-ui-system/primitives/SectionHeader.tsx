/**
 * SectionHeader — 패널 칸 머리. 제목 + 끝단 액션 자리(슬롯).
 *
 * 🔴 접기 삼각형은 없다 (쥔님 판정 2026-10-31 21:55):
 *    *"굳이 접기, 펴기가 필요한가? 그거는 패널 안에서 필요한 내용이지
 *      벌써부터 패널 배치하는 데는 그게 필요 없는 것 같은데"*
 *    ⛔ 다시 달지 말 것 — 사이드바 통째 접기(레일)는 SidePanel 쪽에 이미 있고, 그것과 다른 물건이다.
 *
 * ⭐ 끝단은 「+ 하나」가 아니라 슬롯이다 — 패널마다 다른 액션이 들어온다(쥔님: *"패널 따라 추가적인 액션이 들어갈 수도"*).
 * ⛔ 끝단 단추는 늘 보인다 — Row 의 호버-숨김 판정을 여기로 복사하지 않는다(손가락 기기 함정).
 * 🔴 아래 선 1px — 제목 영역이 몸통과 구분돼야 한다(쥔님: *"제목 영역이랑은 구분되게"*).
 */
import type { ReactNode } from 'react';

export function SectionHeader({
    title,
    end,
}: {
    title: string;
    /** 끝단 액션 자리. 단추 하나든 여럿이든 여기로 들어온다 — 늘 보인다 */
    end?: ReactNode;
}) {
    return (
        <div className="flex items-center gap-1 h-header px-pad shrink-0 select-none border-b border-line">
            <span className="flex-1 min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
                {title}
            </span>
            {end && <span className="flex items-center shrink-0">{end}</span>}
        </div>
    );
}
