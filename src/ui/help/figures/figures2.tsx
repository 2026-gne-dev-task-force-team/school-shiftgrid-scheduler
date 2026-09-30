/**
 * 정지 그림 2/2 — 시안·인쇄·직접 조정·특수 수업 계열 10종.
 *  각 그림은 (className) => <svg> 인 FigRender 다. 색·헬퍼는 helpers.tsx.
 */
import type { ReactNode } from 'react';
import type { FigRender } from './theme';
import { C } from './theme';
import { Svg, T, Arrow, PolyArrow, MiniGrid, Check, Cross } from './helpers';

/** 시안 여러 장과 확정본 도장 */
export const boards: FigRender = (cn) => {
    const cards = [
        { t: '1차 시안', sub: '', pub: false, auto: false },
        { t: '부장 회의 반영', sub: '', pub: true, auto: false },
        { t: '자동 보관', sub: '09-30 14:02', pub: false, auto: true },
    ];
    const xs = [8, 112, 216];
    return (
        <Svg h={120} className={cn} label="이름 붙인 시안 여러 장 가운데 하나를 확정본으로 지정합니다">
            {cards.map((cd, i) => {
                const x = xs[i];
                return (
                    <g key={i}>
                        <rect x={x} y={16} width={96} height={88} rx={8} fill={C.panel}
                            stroke={cd.pub ? C.bad : C.line} strokeWidth={cd.pub ? 2 : 1} />
                        {[0, 1, 2].flatMap((c) => [0, 1].map((r) => (
                            <rect key={`${c}-${r}`} x={x + 14 + c * 18} y={28 + r * 14} width={15} height={11} rx={2}
                                fill={(c + r) % 2 === 0 ? C.accent : C.line} />
                        )))}
                        <T x={x + 48} y={72} fs={cd.auto ? 9.5 : 10.5} color={C.text} weight={600}>{cd.t}</T>
                        {cd.sub && <T x={x + 48} y={90} fs={9} color={C.muted}>{cd.sub}</T>}
                        {cd.pub && (
                            <g transform={`rotate(-14 ${x + 48} 84)`}>
                                <rect x={x + 24} y={76} width={48} height={18} rx={4} fill="none" stroke={C.bad} strokeWidth={1.6} />
                                <T x={x + 48} y={89} fs={10} color={C.bad} weight={700}>확정본</T>
                            </g>
                        )}
                    </g>
                );
            })}
        </Svg>
    );
};

/** 반별·교사별·특별실별 세 표 */
export const printViews: FigRender = (cn) => {
    const titles = ['반별', '교사별', '특별실별'];
    const xs = [8, 112, 216];
    return (
        <Svg h={122} className={cn} label="인쇄는 반별·교사별·특별실별 세 가지 표로 나옵니다">
            {titles.map((t, i) => {
                const x = xs[i];
                return (
                    <g key={i}>
                        <T x={x + 46} y={20} fs={10.5} color={C.text} weight={600}>{t}</T>
                        <rect x={x} y={28} width={92} height={82} rx={4} fill={C.panel} stroke={C.line} />
                        <rect x={x} y={28} width={92} height={16} fill={C.panel2} stroke={C.line} />
                        {[1, 2, 3, 4].map((r) => (
                            <line key={r} x1={x} y1={28 + r * 16} x2={x + 92} y2={28 + r * 16} stroke={C.line} />
                        ))}
                        {[1, 2, 3, 4, 5].map((c) => (
                            <line key={c} x1={x + c * 15.3} y1={28} x2={x + c * 15.3} y2={110} stroke={C.line} />
                        ))}
                    </g>
                );
            })}
        </Svg>
    );
};

/** 상태줄 읽는 법 */
export const statusBar: FigRender = (cn) => {
    const segs = [
        { x1: 8, x2: 108, num: '①' },
        { x1: 108, x2: 212, num: '②' },
        { x1: 212, x2: 312, num: '③' },
    ];
    return (
        <Svg h={116} className={cn} label="상태줄 읽는 법 — 필수 위반, 권장 점수, 배정한 시수">
            <rect x={8} y={58} width={304} height={30} rx={6} fill={C.panel2} stroke={C.line} />
            <line x1={108} y1={58} x2={108} y2={88} stroke={C.line} />
            <line x1={212} y1={58} x2={212} y2={88} stroke={C.line} />
            {/* ① 필수 위반 */}
            <circle cx={24} cy={73} r={4} fill={C.bad} />
            <T x={34} y={77} anchor="start" fs={9.5} color={C.text}>필수 위반 3건</T>
            {/* ② 권장 점수 */}
            <T x={118} y={73} anchor="start" fs={9.5} color={C.text}>권장 점수 4,812</T>
            <T x={118} y={84} anchor="start" fs={7.5} color={C.muted}>낮을수록 좋음</T>
            {/* ③ 배정 */}
            <T x={222} y={77} anchor="start" fs={9.5} color={C.text}>배정 27 / 필요 30시간</T>
            {/* 말풍선 */}
            {segs.map((s, i) => {
                const cx = (s.x1 + s.x2) / 2;
                return (
                    <g key={i}>
                        <rect x={cx - 11} y={20} width={22} height={20} rx={10} fill={C.accent} />
                        <T x={cx} y={34} fs={11} color="#fff">{s.num}</T>
                        <line x1={cx} y1={40} x2={cx} y2={56} stroke={C.accent} strokeWidth={1.2} strokeDasharray="2 2" />
                    </g>
                );
            })}
        </Svg>
    );
};

/** 함께 수업 — 한 칸에 두 이름, 두 교사 모두 그 시각이 빔 */
export const coTeach: FigRender = (cn) => (
    <Svg h={132} className={cn} label="함께 수업은 두 교사가 모두 비는 칸에만 한 칸에 함께 들어갑니다">
        <rect x={100} y={12} width={120} height={32} rx={6} fill={C.accent} />
        <T x={160} y={26} fs={10.5} color="#fff" weight={600}>영어</T>
        <T x={160} y={38} fs={9} color="#fff">가람 + 원어민</T>
        <T x={50} y={60} fs={9.5} color={C.text}>가람</T>
        <T x={215} y={60} fs={9.5} color={C.text}>원어민</T>
        <MiniGrid x={16} y={64} cols={3} rows={3} cw={18} ch={16} showDays={false} showPeriods={false} cells={[
            { c: 1, r: 1, fill: C.okBg, stroke: C.ok },
        ]} />
        <MiniGrid x={182} y={64} cols={3} rows={3} cw={18} ch={16} showDays={false} showPeriods={false} cells={[
            { c: 1, r: 1, fill: C.okBg, stroke: C.ok },
        ]} />
        <Check cx={43} cy={89} />
        <Check cx={209} cy={89} />
        <Arrow x1={120} y1={44} x2={60} y2={62} color={C.muted} w={1.3} />
        <Arrow x1={200} y1={44} x2={222} y2={62} color={C.muted} w={1.3} />
    </Svg>
);

/** 연속 수업 — 붙은 두 칸이 한 덩어리, 점심을 못 넘음 */
export const blockLessons: FigRender = (cn) => (
    <Svg h={142} className={cn} label="연속 수업은 같은 날 붙은 두 칸이 한 덩어리이며 점심을 넘지 않습니다">
        <MiniGrid x={70} y={16} cols={5} rows={6} cw={24} ch={16} cells={[
            { c: 1, r: 2, fill: C.accent, text: '실과', tc: '#fff', fs: 7 },
            { c: 1, r: 3, fill: C.accent, text: '2', tc: '#fff', fs: 8 },
        ]} />
        {/* 한 덩어리 테두리 */}
        <rect x={108} y={60} width={22} height={30} rx={6} fill="none" stroke={C.accent} strokeWidth={2} />
        {/* 점심선 (4교시 뒤) */}
        <line x1={85} y1={93} x2={205} y2={93} stroke={C.warn} strokeWidth={1.6} strokeDasharray="4 3" />
        <T x={210} y={96} anchor="start" fs={8} color={C.warn}>점심</T>
        <T x={160} y={132} fs={9} color={C.muted}>붙은 두 칸은 함께 움직이고 점심을 넘지 않습니다</T>
    </Svg>
);

/** 차시 순서 맞춤 — 모든 반 1차시 뒤 2차시 */
export const cycleOrder: FigRender = (cn) => {
    const g1 = [10, 52, 94];
    const g2 = [140, 182, 224];
    const nums1 = ['①', '②', '③'];
    const nums2 = ['④', '⑤', '⑥'];
    const klass = ['6-1', '6-2', '6-3'];
    const cell = (x: number, num: string, k: string, key: string) => (
        <g key={key}>
            <rect x={x} y={40} width={38} height={32} rx={5} fill={C.accent} />
            <T x={x + 19} y={60} fs={9} color="#fff">과학</T>
            <circle cx={x + 8} cy={48} r={7} fill={C.panel} stroke={C.accent} />
            <T x={x + 8} y={51.5} fs={9} color={C.accent}>{num}</T>
            <T x={x + 19} y={86} fs={8.5} color={C.muted}>{k}</T>
        </g>
    );
    return (
        <Svg h={125} className={cn} label="차시 순서 맞춤 — 모든 반이 1차시를 마친 뒤 2차시를 시작합니다">
            <T x={64} y={28} fs={10} color={C.text} weight={600}>1차시</T>
            <T x={194} y={28} fs={10} color={C.text} weight={600}>2차시</T>
            {g1.map((x, i) => cell(x, nums1[i], klass[i], `a${i}`))}
            {g2.map((x, i) => cell(x, nums2[i], klass[i], `b${i}`))}
            <Arrow x1={134} y1={56} x2={138} y2={56} color={C.muted} w={1.4} />
            <line x1={132} y1={36} x2={132} y2={76} stroke={C.line} strokeDasharray="3 3" />
            <T x={160} y={110} fs={9} color={C.muted}>모든 반이 1차시를 마친 뒤 2차시를 시작합니다</T>
        </Svg>
    );
};

/** 수용 수 — 과학실 2, 같은 시각 두 반까지 */
export const capacity: FigRender = (cn) => {
    const chips = [
        { x: 40, k: '6-1', ok: true },
        { x: 130, k: '6-2', ok: true },
        { x: 220, k: '6-3', ok: false },
    ];
    return (
        <Svg h={134} className={cn} label="특별실 수용 수 — 과학실 2면 같은 시각에 두 반까지 들어갑니다">
            <rect x={100} y={12} width={120} height={30} rx={6} fill={C.home} stroke={C.accent} strokeWidth={1.4} />
            <T x={160} y={31} fs={10} color={C.accenth} weight={600}>과학실 · 수용 수 2</T>
            <T x={160} y={62} fs={8.5} color={C.muted}>같은 시각</T>
            {chips.map((c, i) => (
                <g key={i}>
                    <rect x={c.x} y={78} width={60} height={30} rx={6}
                        fill={c.ok ? C.okBg : C.badBg} stroke={c.ok ? C.ok : C.bad} strokeWidth={1.4} />
                    <T x={c.x + 24} y={97} fs={10} color={C.text}>{c.k}</T>
                    {c.ok ? <Check cx={c.x + 48} cy={93} /> : <Cross cx={c.x + 48} cy={93} />}
                    <Arrow x1={c.x + 30} y1={76} x2={c.x + 30} y2={44} color={c.ok ? C.ok : C.bad} w={1.4} dash={!c.ok} />
                </g>
            ))}
            <T x={160} y={124} fs={9} color={C.muted}>세 번째 반은 다른 시각으로 밀립니다</T>
        </Svg>
    );
};

/** 잠금 — 📌 붙은 칸을 자동 배정이 우회 */
export const pin: FigRender = (cn) => (
    <Svg h={142} className={cn} label="잠긴 수업은 자동 배정이 그 자리를 옮기지 않습니다">
        <MiniGrid x={70} y={16} cols={5} rows={5} cw={24} ch={19} cells={[
            { c: 2, r: 1, fill: C.accent, text: '영어', tc: '#fff', fs: 8 },
        ]} />
        {/* 📌 잠금 핀 */}
        <g transform="translate(150,52)">
            <line x1={0} y1={0} x2={4} y2={8} stroke={C.bad} strokeWidth={1.6} />
            <circle cx={0} cy={0} r={4} fill={C.bad} />
        </g>
        <PolyArrow pts={[[90, 56], [128, 56], [128, 40], [160, 40], [160, 56], [198, 56]]} color={C.accent} w={2} />
        <T x={160} y={137} fs={9.5} color={C.muted}>잠긴 수업은 자동 배정이 옮기지 않습니다</T>
    </Svg>
);

/** 작업 파일 — 하나에 자료·시간표·시안 */
export const workFile: FigRender = (cn) => (
    <Svg h={140} className={cn} label="작업 파일 하나에 자료와 시간표와 시안이 모두 들어 다른 컴퓨터에서 열립니다">
        {/* 문서 아이콘 */}
        <path d="M30 20 h74 l16 16 v84 a4 4 0 0 1 -4 4 H30 a4 4 0 0 1 -4 -4 V24 a4 4 0 0 1 4 -4 z"
            fill={C.panel} stroke={C.line} strokeWidth={1.4} />
        <path d="M104 20 v16 h16" fill="none" stroke={C.line} strokeWidth={1.4} />
        <T x={73} y={48} fs={7} color={C.muted}>우리학교.shiftgrid.json</T>
        {[{ t: '자료', y: 56 }, { t: '시간표', y: 76 }, { t: '시안', y: 96 }].map((b) => (
            <g key={b.t}>
                <rect x={38} y={b.y} width={76} height={16} rx={3} fill={C.home} stroke={C.accent} strokeWidth={0.8} />
                <T x={76} y={b.y + 11} fs={9} color={C.accenth}>{b.t}</T>
            </g>
        ))}
        {/* 다른 컴퓨터 */}
        <rect x={230} y={44} width={70} height={44} rx={4} fill={C.panel2} stroke={C.line} strokeWidth={1.4} />
        <rect x={257} y={88} width={16} height={7} fill={C.line} />
        <rect x={246} y={95} width={38} height={4} rx={2} fill={C.line} />
        <T x={265} y={70} fs={8.5} color={C.muted}>다른 컴퓨터</T>
        <Arrow x1={136} y1={66} x2={226} y2={66} color={C.accent} w={1.8} />
        <T x={181} y={58} fs={8.5} color={C.accent}>열림</T>
    </Svg>
);

/** 엑셀 표 → 시수표 붙이기 */
export const excelPaste: FigRender = (cn) => {
    const cols = ['교사', '과목', '학년', '반', '시수'];
    const data = [
        ['가람', '영어', '6', '1', '3'],
        ['누리', '과학', '6', '2', '2'],
        ['한결', '체육', '5', '1', '2'],
    ];
    const table = (ox: number, head: string, headColor: string) => {
        const cw = 26, rh = 16;
        const items: ReactNode[] = [];
        items.push(<T key="h" x={ox + 65} y={15} fs={9.5} color={headColor} weight={600}>{head}</T>);
        items.push(<rect key="hr" x={ox} y={20} width={cw * 5} height={rh} fill={C.panel2} stroke={C.line} />);
        cols.forEach((c, i) => items.push(<text key={`hc${i}`} x={ox + i * cw + cw / 2} y={31} textAnchor="middle" fill={C.muted} fontSize={7.5}>{c}</text>));
        data.forEach((row, r) => {
            const y = 20 + (r + 1) * rh;
            items.push(<rect key={`rr${r}`} x={ox} y={y} width={cw * 5} height={rh} fill={C.panel} stroke={C.line} />);
            row.forEach((v, i) => items.push(<text key={`v${r}-${i}`} x={ox + i * cw + cw / 2} y={y + 11} textAnchor="middle" fill={C.text} fontSize={7.5}>{v}</text>));
        });
        for (let i = 1; i < 5; i++) items.push(<line key={`vl${ox}-${i}`} x1={ox + i * cw} y1={20} x2={ox + i * cw} y2={20 + 4 * rh} stroke={C.line} />);
        return <g>{items}</g>;
    };
    return (
        <Svg h={110} className={cn} label="엑셀 표를 복사해 시수표에 붙이면 같은 열 순서로 들어갑니다">
            {table(6, '엑셀', C.text)}
            {table(184, '시수표', C.accenth)}
            <Arrow x1={140} y1={54} x2={180} y2={54} color={C.accent} w={2} />
            <T x={160} y={44} fs={9} color={C.accent} weight={600}>Ctrl+V</T>
        </Svg>
    );
};
