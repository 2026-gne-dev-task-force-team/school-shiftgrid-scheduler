/**
 * 정지 그림 1/2 — 흐름·기초자료·규칙 계열 10종.
 *  각 그림은 (className) => <svg> 인 FigRender 다. 색·헬퍼는 helpers.tsx.
 */
import type { ReactNode } from 'react';
import type { FigRender } from './theme';
import { C } from './theme';
import { Svg, T, Star, Arrow, PolyArrow, MiniGrid } from './helpers';

/** 시수표 → 자동 배정 → 시간표 */
export const flow: FigRender = (cn) => (
    <Svg h={118} className={cn} label="시수표에서 자동 배정을 거쳐 시간표가 완성되는 흐름입니다">
        <rect x={8} y={22} width={92} height={64} rx={8} fill={C.panel2} stroke={C.line} />
        <rect x={20} y={34} width={68} height={9} rx={2} fill={C.line} />
        <rect x={20} y={49} width={68} height={9} rx={2} fill={C.line} />
        <rect x={20} y={64} width={68} height={9} rx={2} fill={C.line} />
        <Star cx={160} cy={54} />
        {[0, 1, 2, 3].flatMap((c) => [0, 1, 2].map((r) => (
            <rect key={`${c}-${r}`} x={212 + c * 22} y={34 + r * 16} width={18} height={12} rx={2}
                fill={(c + r) % 2 === 0 ? C.accent : C.line} />
        )))}
        <Arrow x1={104} y1={54} x2={140} y2={54} />
        <Arrow x1={180} y1={54} x2={208} y2={54} />
        <T x={54} y={104}>시수표</T>
        <T x={160} y={104}>자동 배정</T>
        <T x={262} y={104}>시간표</T>
    </Svg>
);

/** 시수표 한 줄이 반마다 몇 칸이 되나 */
export const demandRow: FigRender = (cn) => (
    <Svg h={138} className={cn} label="시수표 한 줄은 반마다 그 과목 칸이 됩니다">
        <rect x={8} y={48} width={150} height={30} rx={6} fill={C.panel2} stroke={C.line} />
        <rect x={8} y={48} width={4} height={30} fill={C.accent} />
        <T x={18} y={67} anchor="start" fs={9.5} color={C.text}>가람 · 영어 · 6학년 · 1~3반 · 주 3</T>
        <T x={232} y={13} fs={9.5} color={C.text} weight={600}>6-1</T>
        <MiniGrid x={178} y={18} cols={5} rows={5} cw={18} ch={17} cells={[
            { c: 0, r: 1, fill: C.accent, text: '영어', tc: '#fff', fs: 7 },
            { c: 2, r: 0, fill: C.accent, text: '영어', tc: '#fff', fs: 7 },
            { c: 4, r: 3, fill: C.accent, text: '영어', tc: '#fff', fs: 7 },
        ]} />
        <Arrow x1={160} y1={63} x2={184} y2={70} />
        <T x={100} y={128} fs={10} color={C.muted}>한 줄 = 반마다 영어 3칸</T>
    </Svg>
);

/** 담임은 반의 속성 — 빈 칸이 전부 담임 수업 */
export const homeroom: FigRender = (cn) => (
    <Svg h={152} className={cn} label="전담 칸을 뺀 나머지 빈 칸은 모두 담임 수업입니다">
        <MiniGrid x={90} y={14} cols={5} rows={5} cw={24} ch={19}
            defFill={C.home} defText="담임" defTc={C.accenth} defFs={8} cells={[
                { c: 0, r: 0, fill: C.accent, text: '영어', tc: '#fff', fs: 8 },
                { c: 2, r: 1, fill: C.accent, text: '과학', tc: '#fff', fs: 8 },
                { c: 3, r: 2, fill: C.accent, text: '체육', tc: '#fff', fs: 8 },
                { c: 1, r: 3, fill: C.accent, text: '음악', tc: '#fff', fs: 8 },
            ]} />
        <T x={160} y={137} fs={10} color={C.muted}>빈 칸 = 담임 수업</T>
        <T x={160} y={149} fs={9} color={C.muted}>담임은 교사 명부에 넣지 않습니다</T>
    </Svg>
);

/** 시간 틀 — 학년마다 교시 시각이 다르다 */
export const specDay: FigRender = (cn) => {
    const axisY = 116;
    const hours = [9, 10, 11, 12, 13, 14, 15];
    // 두 학년군의 교시 길이를 달리해 같은 3교시가 다른 시각에 오게 한다.
    const bar1 = [28, 28, 28, 28, 20, 28];        // p1~p4, 점심, p5
    const bar2 = [34, 34, 34, 34, 20, 34, 34];    // p1~p4, 점심, p5, p6
    const cellsOf = (widths: number[], y: number, lunchIdx: number) => {
        let cx = 30; const out: ReactNode[] = []; let pnum = 1;
        widths.forEach((w, i) => {
            const isLunch = i === lunchIdx;
            out.push(<rect key={`b${y}-${i}`} x={cx} y={y} width={w - 2} height={20} rx={3}
                fill={isLunch ? C.warnBg : C.panel2} stroke={C.line} />);
            out.push(<text key={`bt${y}-${i}`} x={cx + (w - 2) / 2} y={y + 14} textAnchor="middle"
                fill={isLunch ? C.warn : C.muted} fontSize={isLunch ? 7 : 9}>{isLunch ? '점심' : pnum}</text>);
            if (!isLunch) pnum++;
            cx += w;
        });
        return out;
    };
    const centerOf = (widths: number[], idx: number) => 30 + widths.slice(0, idx).reduce((a, b) => a + b, 0) + (widths[idx] - 2) / 2;
    const x3a = centerOf(bar1, 2);
    const x3b = centerOf(bar2, 2);
    return (
        <Svg h={140} className={cn} label="학년군마다 교시 시각이 달라 같은 3교시가 다른 시각에 옵니다">
            <T x={30} y={26} anchor="start" fs={9.5} color={C.text}>1·2학년 · 5교시</T>
            {cellsOf(bar1, 32, 4)}
            <T x={30} y={62} anchor="start" fs={9.5} color={C.text}>5·6학년 · 6교시</T>
            {cellsOf(bar2, 68, 4)}
            <line x1={30} y1={axisY} x2={306} y2={axisY} stroke={C.line} strokeWidth={1.2} />
            {hours.map((h, i) => (
                <g key={h}>
                    <line x1={30 + i * 45} y1={axisY} x2={30 + i * 45} y2={axisY + 4} stroke={C.muted} />
                    <text x={30 + i * 45} y={axisY + 15} textAnchor="middle" fill={C.muted} fontSize={8}>{`${h}:00`}</text>
                </g>
            ))}
            <line x1={x3a} y1={52} x2={x3a} y2={axisY} stroke={C.accent} strokeWidth={1.2} strokeDasharray="3 2" />
            <line x1={x3b} y1={88} x2={x3b} y2={axisY} stroke={C.accent} strokeWidth={1.2} strokeDasharray="3 2" />
            <T x={x3a} y={49} fs={8} color={C.accent}>3교시</T>
            <T x={x3b} y={107} fs={8} color={C.accent}>3교시</T>
        </Svg>
    );
};

/** 배정/필요 — 남음·완료·초과 */
export const remaining: FigRender = (cn) => {
    const rows = [
        { label: '0/3 남음 3', filled: 0, color: C.accent, over: 0 },
        { label: '2/3 남음 1', filled: 2, color: C.accent, over: 0 },
        { label: '3/3 완료', filled: 3, color: C.muted, over: 0 },
        { label: '4/3 초과 1', filled: 3, color: C.accent, over: 1 },
    ];
    const sx = 150, sw = 34, gap = 3;
    return (
        <Svg h={144} className={cn} label="배정한 시수와 필요한 시수 — 남음·완료·초과를 막대로 봅니다">
            {rows.map((row, i) => {
                const y = 18 + i * 30;
                return (
                    <g key={i}>
                        <T x={8} y={y + 13} anchor="start" fs={10.5} color={row.over ? C.bad : (i === 2 ? C.muted : C.text)}>{row.label}</T>
                        {[0, 1, 2].map((k) => (
                            <rect key={k} x={sx + k * (sw + gap)} y={y} width={sw} height={16} rx={3}
                                fill={k < row.filled ? row.color : C.panel2} stroke={C.line} />
                        ))}
                        {row.over > 0 && (
                            <rect x={sx + 3 * (sw + gap)} y={y} width={sw} height={16} rx={3} fill={C.bad} stroke={C.bad} />
                        )}
                    </g>
                );
            })}
        </Svg>
    );
};

/** 고정·금지 세 상태 */
export const blockStates: FigRender = (cn) => {
    const w = 48, h = 40, y = 22;
    const xs = [14, 90, 166, 242];
    const labels = ['없음', '배정 불가', '되도록 피함', '임시 불가'];
    const x = xs;
    return (
        <Svg h={116} className={cn} label="고정·금지 칸의 세 상태 — 배정 불가·되도록 피함·임시 불가">
            {/* 없음 */}
            <rect x={x[0]} y={y} width={w} height={h} rx={4} fill={C.panel2} stroke={C.line} />
            {/* 배정 불가 — 빨강 빗금 */}
            <rect x={x[1]} y={y} width={w} height={h} rx={4} fill={C.badBg} stroke={C.bad} strokeWidth={1.4} />
            <g stroke={C.bad} strokeWidth={1.3}>
                {[13, 26, 39].map((d) => <line key={`a${d}`} x1={x[1]} y1={y + d} x2={x[1] + d} y2={y} />)}
                {[13, 26].map((d) => <line key={`b${d}`} x1={x[1] + d} y1={y + h} x2={x[1] + w - 2} y2={y + d + 2} />)}
            </g>
            {/* 되도록 피함 — 노랑 점 */}
            <rect x={x[2]} y={y} width={w} height={h} rx={4} fill={C.warnBg} stroke={C.warn} strokeWidth={1.2} />
            <g fill={C.warn}>
                {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
                    <circle key={`${r}-${c}`} cx={x[2] + 12 + c * 12} cy={y + 10 + r * 10} r={1.7} />
                )))}
            </g>
            {/* 임시 불가 — 점선 테두리 */}
            <rect x={x[3]} y={y} width={w} height={h} rx={4} fill={C.panel2} stroke={C.muted} strokeWidth={1.4} strokeDasharray="4 3" />
            {/* 라벨 + 순서 화살표 */}
            {labels.map((t, i) => <T key={t} x={x[i] + w / 2} y={y + h + 14} fs={8.5} color={C.muted}>{t}</T>)}
            {[0, 1, 2].map((i) => (
                <Arrow key={i} x1={x[i] + w + 3} y1={y + h / 2} x2={x[i + 1] - 3} y2={y + h / 2} color={C.muted} w={1.3} />
            ))}
            <T x={160} y={y + h + 30} fs={9} color={C.muted}>칸을 누를 때마다 순서대로 바뀝니다</T>
        </Svg>
    );
};

/** 고정 수업 — 창체가 칸을 미리 차지 */
export const fixedLesson: FigRender = (cn) => (
    <Svg h={142} className={cn} label="고정 수업 창체가 칸을 미리 차지하고 자동 배정이 그 칸을 건너뜁니다">
        <MiniGrid x={70} y={16} cols={5} rows={5} cw={24} ch={19} cells={[
            { c: 2, r: 1, fill: C.panel2, stroke: C.muted, text: '창체', tc: C.muted, fs: 8 },
        ]} />
        {/* 자물쇠 */}
        <g transform="translate(137,58)">
            <rect x={0} y={3} width={9} height={7} rx={1.5} fill={C.muted} />
            <path d={`M1.5 3 v-1.5 a3 3 0 0 1 6 0 V3`} fill="none" stroke={C.muted} strokeWidth={1.3} />
        </g>
        {/* 자동 배정 화살표가 창체 칸을 우회 */}
        <PolyArrow pts={[[90, 56], [128, 56], [128, 40], [160, 40], [160, 56], [198, 56]]} color={C.accent} w={2} />
        <T x={160} y={137} fs={9.5} color={C.muted}>고정 수업은 자동 배정이 건너뜁니다</T>
    </Svg>
);

/** 직접 조정 색 범례 */
export const moveLegend: FigRender = (cn) => (
    <Svg h={128} className={cn} label="직접 조정의 칸 색 — 초록 옮길 수 있음, 노랑 권장 점수 증가, 빨강 필수 위반">
        <MiniGrid x={6} y={12} cols={5} rows={5} cw={22} ch={18} cells={[
            { c: 1, r: 1, fill: C.home, ring: true, text: '영어', tc: C.accenth, fs: 7 },
            { c: 0, r: 2, fill: C.ok, text: '', }, { c: 3, r: 0, fill: C.ok }, { c: 4, r: 3, fill: C.ok },
            { c: 2, r: 3, fill: C.warn }, { c: 1, r: 4, fill: C.warn },
            { c: 3, r: 4, fill: C.bad }, { c: 0, r: 0, fill: C.bad },
        ]} />
        {([
            { c: C.accent, t: '선택한 수업', ring: true },
            { c: C.ok, t: '옮길 수 있음' },
            { c: C.warn, t: '권장 점수 증가' },
            { c: C.bad, t: '필수 위반' },
        ]).map((row, i) => {
            const y = 22 + i * 24;
            return (
                <g key={i}>
                    <rect x={150} y={y} width={18} height={14} rx={3} fill={row.ring ? C.home : row.c}
                        stroke={row.ring ? C.accent : row.c} strokeWidth={row.ring ? 2 : 1} />
                    <T x={176} y={y + 11} anchor="start" fs={10} color={C.text}>{row.t}</T>
                </g>
            );
        })}
    </Svg>
);

/** 시간표 후보 카드 3장 */
export const candidates: FigRender = (cn) => {
    const cards = [
        { t: '후보 1', hard: '필수 0', soft: '권장 4,812', rec: true, bad: false },
        { t: '후보 2', hard: '필수 0', soft: '권장 5,030', rec: false, bad: false },
        { t: '후보 3', hard: '필수 2', soft: '', rec: false, bad: true },
    ];
    const xs = [8, 112, 216];
    return (
        <Svg h={120} className={cn} label="자동 배정이 만든 시간표 후보 세 장 — 필수 위반과 권장 점수, 추천 배지">
            {cards.map((cd, i) => {
                const x = xs[i];
                return (
                    <g key={i}>
                        <rect x={x} y={18} width={96} height={86} rx={8}
                            fill={C.panel} stroke={cd.rec ? C.accent : C.line} strokeWidth={cd.rec ? 2 : 1} />
                        <T x={x + 14} y={40} anchor="start" fs={11} color={C.text} weight={600}>{cd.t}</T>
                        <T x={x + 14} y={62} anchor="start" fs={10} color={cd.bad ? C.bad : C.ok}>{cd.hard}</T>
                        {cd.soft && <T x={x + 14} y={82} anchor="start" fs={10} color={C.muted}>{cd.soft}</T>}
                        {cd.rec && (
                            <g>
                                <rect x={x + 56} y={26} width={32} height={16} rx={8} fill={C.accent} />
                                <T x={x + 72} y={38} fs={9} color="#fff">추천</T>
                            </g>
                        )}
                    </g>
                );
            })}
        </Svg>
    );
};

/** 필수 규칙(벽) vs 권장 규칙(저울) */
export const rulesTwo: FigRender = (cn) => (
    <Svg h={148} className={cn} label="필수 규칙은 넘을 수 없는 벽, 권장 규칙은 점수를 재는 저울입니다">
        <line x1={160} y1={12} x2={160} y2={136} stroke={C.line} strokeDasharray="3 3" />
        <T x={80} y={22} fs={11} color={C.bad} weight={600}>필수 규칙</T>
        {/* 벽 */}
        {[0, 1, 2, 3].map((row) => (
            <g key={row}>
                {[0, 1, 2, 3].map((col) => (
                    <rect key={col} x={22 + col * 30 + (row % 2 ? 15 : 0)} y={32 + row * 14} width={28} height={12} rx={1.5}
                        fill={C.badBg} stroke={C.bad} strokeWidth={1} />
                ))}
            </g>
        ))}
        <T x={80} y={104} fs={9} color={C.muted}>넘을 수 없음 · 위반 0이어야 성립</T>
        <T x={80} y={120} fs={8.5} color={C.muted}>예: 같은 교사 같은 시각 두 반</T>

        <T x={240} y={22} fs={11} color={C.warn} weight={600}>권장 규칙</T>
        {/* 저울 */}
        <line x1={240} y1={44} x2={240} y2={92} stroke={C.muted} strokeWidth={2} />
        <line x1={196} y1={92} x2={284} y2={92} stroke={C.muted} strokeWidth={2} strokeLinecap="round" />
        <line x1={205} y1={52} x2={275} y2={40} stroke={C.warn} strokeWidth={2} strokeLinecap="round" />
        <circle cx={240} cy={44} r={3} fill={C.warn} />
        <g fill="none" stroke={C.warn} strokeWidth={1.3}>
            <path d="M205 52 l-8 12 h16 z" />
            <path d="M275 40 l-8 12 h16 z" />
        </g>
        <T x={240} y={110} fs={9} color={C.muted}>점수 · 낮을수록 좋음</T>
        <T x={240} y={126} fs={8.5} color={C.muted}>예: 한 교사 하루 4연속</T>
    </Svg>
);
