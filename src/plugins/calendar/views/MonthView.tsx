/**
 * 월 보기 — 구글/노션 캘린더 같은 월 그리드 하나.
 *   🔴 ⛔ 일정 데이터·칸 클릭·「+」·저장 없음(쥔님 2026-11-01: *"아직 일정 추가 안할거고 그냥 월 보기만 할겨,
 *      일정 추가 하지마 월그리드만 해"*). 보고 있는 달은 컴포넌트 state 뿐 — ⛔ 저장 안 함(host.storage 도 안 쓴다).
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 여백 넉넉 · 장식 없음 · 얇은 1px 경계선(line 토큰).
 */
import { useRef, useState } from 'react';
import type { WheelEvent as RWheelEvent } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌이다 — 플러그인 안에 사본을 두지 않는다(메인 머지 때 합침 16:5x)
import { IconButton, monthGrid, shiftMonth, monthLabel } from '../../../pane-ui-system';

// 🔑 주 시작 요일은 일요일 고정 — 설정으로 뺄 자리다. 지금은 weekStart 인자만 열어 두고 0 으로만 부른다.
const WEEK_START = 0;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 휠로 월 넘기기(쥔님 2026-11-01 16:55 *"달력 월 넘기는거 세로 스크롤 지원해줘"*) — 구글 캘린더처럼 아래로 굴리면 다음 달.
//   한 번 넘긴 뒤 잠깐 잠근다: 트랙패드 관성이 한 번에 대여섯 달을 넘기는 것을 막는다.
const WHEEL_STEP_PX = 48;        // 이만큼 쌓이면 한 달
const WHEEL_COOLDOWN_MS = 280;   // 넘긴 뒤 이 동안은 무시

export function MonthView() {
    const now = new Date();
    const [ym, setYm] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() + 1 });
    const wheelAcc = useRef(0);
    const wheelLockUntil = useRef(0);

    const go = (delta: number) =>
        setYm(({ y, m }) => {
            const [ny, nm] = shiftMonth(y, m, delta);
            return { y: ny, m: nm };
        });
    const onWheel = (e: RWheelEvent<HTMLDivElement>) => {
        const t = performance.now();
        if (t < wheelLockUntil.current) return;
        // deltaMode 1 = 줄 단위(마우스 휠) → 픽셀로 맞춘다. 방향이 바뀌면 쌓인 것을 버린다.
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        if (Math.sign(dy) !== Math.sign(wheelAcc.current)) wheelAcc.current = 0;
        wheelAcc.current += dy;
        if (Math.abs(wheelAcc.current) >= WHEEL_STEP_PX) {
            go(wheelAcc.current > 0 ? 1 : -1);
            wheelAcc.current = 0;
            wheelLockUntil.current = t + WHEEL_COOLDOWN_MS;
        }
    };
    const goToday = () => {
        const n = new Date();
        setYm({ y: n.getFullYear(), m: n.getMonth() + 1 });
    };

    const cells = monthGrid(ym.y, ym.m, WEEK_START, new Date());   // 부품 쪽은 today 기본값이 없다 — 여기서 지금을 넘긴다
    const labels = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(WEEK_START + i) % 7]);

    return (
        <div className="h-full flex flex-col bg-bg select-text" onWheel={onWheel}>
            {/* 머리줄 — 왼쪽 달 이름 · 오른쪽 이동(◀ 오늘 ▶) */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0">
                <h2 className="text-base font-semibold text-text">{monthLabel(ym.y, ym.m)}</h2>
                <div className="flex items-center gap-1">
                    <IconButton icon="left" label="이전 달" onClick={() => go(-1)} />
                    <button
                        type="button"
                        onClick={goToday}
                        className="px-2 h-btn rounded text-[12px] text-muted hover:text-text hover:bg-text/[0.06] transition-colors"
                    >
                        오늘
                    </button>
                    <IconButton icon="right" label="다음 달" onClick={() => go(1)} />
                </div>
            </header>

            {/* 요일 머리 7칸 */}
            <div className="grid grid-cols-7 shrink-0 border-t border-l border-line">
                {labels.map((w) => (
                    <div
                        key={w}
                        className="border-r border-b border-line py-1 text-center text-[11px] font-medium text-muted select-none"
                    >
                        {w}
                    </div>
                ))}
            </div>

            {/* 본문 6행×7열 — 칸이 세로로 늘어나 탭 높이를 꽉 채운다(grid-rows-6 = 1fr×6) */}
            <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0 border-l border-line">
                {cells.map((c) => (
                    <div key={c.iso} className="min-h-0 overflow-hidden border-r border-b border-line p-1">
                        {/* 날짜 숫자는 칸 왼쪽 위 작게 · 이웃 달은 흐리게 · 오늘은 강조 동그라미 */}
                        <div className="flex">
                            {c.isToday ? (
                                <span className="grid place-items-center w-5 h-5 rounded-full bg-accent text-bg text-[11px] font-semibold">
                                    {c.d}
                                </span>
                            ) : (
                                <span className={`px-1 text-[11px] leading-5 ${c.inMonth ? 'text-text' : 'text-muted'}`}>
                                    {c.d}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
