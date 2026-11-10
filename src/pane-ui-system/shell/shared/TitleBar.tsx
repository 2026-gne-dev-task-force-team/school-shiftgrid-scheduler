/**
 * 상단 타이틀바 — 리본·사이드바·가운데 「위에」 가로로 한 줄(전체 폭). 판 A(쥔님 2026-11-01:
 *   *"상단에 제목바가 있고 액션바가 있고"*). 틀이 자리만 그리고 내용은 앱이 슬롯으로 넘긴다.
 *
 * 🔴 ⛔ 창틀은 앱 이름을 모른다 — 왼쪽은 `title` prop(앱이 넘긴다), 오른쪽 액션은 `actions` 배열(앱이 꽂는다).
 *    가운데는 비워 둔다(나중에 검색·명령 자리). 설정 ⚙ 는 여기 두지 않는다 — 리본 아래에 그대로 산다.
 * ⚠️ 맥 PWA(창 조절 오버레이)·일렉트론에서 이 줄이 「창을 끄는 손잡이」가 되도록 -webkit-app-region: drag.
 *    단추는 눌려야 하므로 no-drag 로 되돌린다(드래그 영역이면 클릭이 안 먹는다).
 * 🔴 색은 토큰으로만(구조 검사 ①). 보임/숨김은 WorkbenchScreen 이 설정으로 가른다 — 여긴 늘 그린다.
 */
import type { CSSProperties, ReactNode } from 'react';
import { IconButton } from '../../primitives/IconButton';
import type { IconName } from '../../primitives/Icon';

/** 타이틀바 오른쪽에 앱이 꽂는 액션 하나 — 아이콘 단추. ⛔ 창틀은 뜻을 모른다 */
export interface TitleAction {
    id: string;
    icon: IconName;
    label: string;
    onClick: () => void;
    active?: boolean;
}

// -webkit-app-region 은 csstype 에 없다 — 창 드래그용 비표준 CSS 라 unknown 을 거쳐 캐스팅한다
const DRAG = { WebkitAppRegion: 'drag' } as unknown as CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as unknown as CSSProperties;

export function TitleBar({
    title, actions = [], center,
}: {
    /** 왼쪽 앱 이름 슬롯 — 창틀은 이름을 모른다(앱이 넘긴다) */
    title?: string;
    /** 오른쪽 액션 슬롯 — 앱이 꽂는 아이콘 단추들 */
    actions?: TitleAction[];
    /** 가운데 슬롯(나중에 검색·명령) — 지금은 보통 비운다 */
    center?: ReactNode;
}) {
    return (
        <div
            className="shrink-0 flex items-center gap-2 h-titlebar px-pad border-b border-line bg-side2 select-none"
            style={DRAG}
        >
            {/* 왼쪽: 앱 이름 — 좁아지면 먼저 잘린다(가운데·오른쪽 자리를 지킨다) */}
            {title && <span className="shrink min-w-0 truncate text-small font-semibold text-text">{title}</span>}

            {/* 가운데: 빈 자리(나중에 검색·명령). 공간을 먹어 액션을 오른쪽 끝으로 민다 */}
            <div className="flex-1 min-w-0 flex items-center justify-center" style={NO_DRAG}>{center}</div>

            {/* 오른쪽: 액션 슬롯 — 단추는 드래그 영역에서 뺀다(no-drag) */}
            {actions.length > 0 && (
                <div className="flex items-center gap-0.5 shrink-0" style={NO_DRAG}>
                    {actions.map((a) => (
                        <IconButton key={a.id} icon={a.icon} label={a.label} active={a.active} onClick={a.onClick} />
                    ))}
                </div>
            )}
        </div>
    );
}
