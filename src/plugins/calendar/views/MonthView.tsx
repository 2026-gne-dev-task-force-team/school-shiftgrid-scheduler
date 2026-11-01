/**
 * 월 보기 — 구글/노션 캘린더 같은 월 그리드 하나.
 *   🔴 ⛔ 일정 데이터·칸 클릭·「+」·저장 없음(쥔님 2026-11-01: *"아직 일정 추가 안할거고 그냥 월 보기만 할겨,
 *      일정 추가 하지마 월그리드만 해"*). 보고 있는 달은 컴포넌트 state 뿐 — ⛔ 저장 안 함(host.storage 도 안 쓴다).
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 여백 넉넉 · 장식 없음 · 얇은 1px 경계선(line 토큰).
 */
import { useEffect, useRef, useState } from 'react';
import type { WheelEvent as RWheelEvent } from 'react';
// 🔑 날짜 계산은 창틀 부품(primitives/date-grid)과 한 벌이다 — 플러그인 안에 사본을 두지 않는다(메인 머지 때 합침 16:5x)
import { Icon, IconButton, Surface, monthGrid, shiftMonth, monthLabel } from '../../../pane-ui-system';

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

    // 년·월 점프(쥔님 16:56 *"년 월 선택하면 바로 점프하러 갈수 있는거 있어야지"*) — 달 이름을 누르면 작은 판이 뜬다.
    //   년도는 ◀ ▶ 로, 달은 12칸 격자에서 하나 고르면 바로 가고 닫힌다. 바깥 클릭·Esc 로 닫힌다.
    const [jumpOpen, setJumpOpen] = useState(false);
    const [jumpYear, setJumpYear] = useState(ym.y);
    const jumpRef = useRef<HTMLDivElement>(null);
    const openJump = () => { setJumpYear(ym.y); setJumpOpen((o) => !o); };
    const jumpTo = (m: number) => { setYm({ y: jumpYear, m }); setJumpOpen(false); };
    useEffect(() => {
        if (!jumpOpen) return;
        const onDown = (e: PointerEvent) => { if (!jumpRef.current?.contains(e.target as Node)) setJumpOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setJumpOpen(false); };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [jumpOpen]);

    const cells = monthGrid(ym.y, ym.m, WEEK_START, new Date());   // 부품 쪽은 today 기본값이 없다 — 여기서 지금을 넘긴다
    const labels = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(WEEK_START + i) % 7]);

    return (
        <div className="relative h-full flex flex-col bg-bg select-text" onWheel={onWheel}>
            {/* 머리줄 — 왼쪽 달 이름(누르면 년·월 점프) · 오른쪽 이동(◀ 오늘 ▶) */}
            <header className="flex items-center justify-between px-pad py-2 shrink-0">
                <div ref={jumpRef} className="relative">
                    <button
                        type="button"
                        onClick={openJump}
                        aria-expanded={jumpOpen}
                        aria-label="년·월 고르기"
                        className="flex items-center gap-1 -ml-1 px-1 rounded text-base font-semibold text-text hover:bg-text/[0.06] transition-colors"
                    >
                        {monthLabel(ym.y, ym.m)}
                        <Icon name="right" size={14} className={`text-muted transition-transform ${jumpOpen ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                    {jumpOpen && (
                        <Surface bordered rounded className="absolute left-0 top-full mt-1 z-10 p-2 w-[232px] shadow-lg">
                            {/* 년도 줄 */}
                            <div className="flex items-center justify-between mb-1">
                                <IconButton icon="left" label="이전 해" onClick={() => setJumpYear((y) => y - 1)} />
                                <span className="text-[13px] font-semibold text-text tabular-nums">{jumpYear}년</span>
                                <IconButton icon="right" label="다음 해" onClick={() => setJumpYear((y) => y + 1)} />
                            </div>
                            {/* 달 12칸 — 지금 보는 달은 accent, 오늘 달은 점 */}
                            <div className="grid grid-cols-4 gap-1">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                                    const isCurrent = jumpYear === ym.y && m === ym.m;
                                    const isThisMonth = jumpYear === now.getFullYear() && m === now.getMonth() + 1;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => jumpTo(m)}
                                            className={`relative h-8 rounded text-[13px] tabular-nums transition-colors
                                                ${isCurrent ? 'bg-accent text-bg font-semibold' : 'text-text hover:bg-text/[0.06]'}`}
                                        >
                                            {m}월
                                            {isThisMonth && !isCurrent && (
                                                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </Surface>
                    )}
                </div>
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
