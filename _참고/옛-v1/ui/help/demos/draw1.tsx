/**
 * 움직이는 사용법 그림 (1) — move-lesson · block-cycle · demand-to-grid · pick-candidate.
 *  각 컴포넌트는 scene 번호를 받아 SVG 요소를 그린다. 요소 key 를 장면 사이에 유지해 CSS transition 이 걸리게 한다.
 */
import { C, fillA, cellX, cellY, DAYS5 } from './palette';
import { Grid, Cell, Cursor, Card, Btn, Txt, Title } from './parts';

// ── 수업 옮기기 ──────────────────────────────────────────────
export function MoveLessonDraw({ scene }: { scene: number }) {
    const gx = 24, gy = 26, cw = 40, ch = 24;
    const oCol = 1, oRow = 2;   // 화요일 3교시
    const tCol = 3, tRow = 1;   // 목요일 2교시
    const ox = cellX(gx, oCol, cw), oy = cellY(gy, oRow, ch);
    const tx = cellX(gx, tCol, cw), ty = cellY(gy, tRow, ch);
    const moved = scene >= 4;
    const showColor = scene >= 1 && scene <= 3;
    const showCard = scene === 3 || scene === 4;
    const selected = scene <= 3;
    const cand: Array<[number, number, 'ok' | 'warn' | 'bad']> = [
        [tCol, tRow, 'ok'], [2, 2, 'ok'], [4, 0, 'warn'], [0, 3, 'bad'],
    ];
    const cur = curPos(scene, [
        [ox + 24, oy + 2, true], [ox + 24, oy + 2, false], [tx + 22, ty + 2, true],
        [244, 96, false], [244, 96, true], [20, 150, false],
    ]);
    return (
        <g>
            <Title>화요일 3교시 「영어」를 목요일 2교시로</Title>
            <Grid gx={gx} gy={gy} days={DAYS5} rows={4} cw={cw} ch={ch} />
            {showColor && cand.map(([c, r, t]) => (
                <Cell key={`c${c}${r}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={fillA(t, 0.35)} stroke={C[t]} />
            ))}
            <g className="demo-el" style={{ transform: `translate(${moved ? tx - ox : 0}px, ${moved ? ty - oy : 0}px)` }}>
                <Cell x={ox} y={oy} w={cw} h={ch} fill={C.accent} op={0.85} labelFill="#fff" label="영어" ring={selected} />
            </g>
            {showCard && (
                <Card x={230} y={34} w={86} h={92} title="이동 미리보기" accent>
                    <Txt x={238} y={54} size={9} anchor="start" fill={C.muted}>필수</Txt>
                    <Txt x={308} y={54} size={9} anchor="end" fill={C.ok}>0 → 0</Txt>
                    <Txt x={238} y={70} size={9} anchor="start" fill={C.muted}>권장</Txt>
                    <Txt x={308} y={70} size={9} anchor="end" fill={C.text}>4,812 → 4,790</Txt>
                    <Btn x={238} y={100} w={70} h={18} label="이동" />
                </Card>
            )}
            <Cursor x={cur[0]} y={cur[1]} pressed={cur[2] as boolean} pressKey={scene} />
        </g>
    );
}

// ── 고정·금지: 상태 순환 ─────────────────────────────────────
export function BlockCycleDraw({ scene }: { scene: number }) {
    const gx = 24, gy = 26, cw = 40, ch = 24;
    const col = 2, row = 0;   // 수요일 1교시
    const x = cellX(gx, col, cw), y = cellY(gy, row, ch);
    const state = ([
        { fill: C.panel, stroke: C.line, label: '', dash: false },
        { fill: fillA('bad', 0.3), stroke: C.bad, label: '배정 불가', dash: false },
        { fill: fillA('warn', 0.3), stroke: C.warn, label: '되도록 피함', dash: false },
        { fill: C.panel, stroke: C.warn, label: '임시 불가', dash: true },
        { fill: C.panel, stroke: C.line, label: '', dash: false },
    ] as const)[scene] ?? { fill: C.panel, stroke: C.line, label: '', dash: false };
    return (
        <g>
            <Title>교사 「가람」 — 같은 칸을 누를 때마다 상태가 바뀝니다</Title>
            <Grid gx={gx} gy={gy} days={DAYS5} rows={4} cw={cw} ch={ch} />
            <Cell x={x} y={y} w={cw} h={ch} fill={state.fill} stroke={state.stroke}
                label={state.label} labelFill={state.dash ? C.warn : C.text} dash={state.dash} />
            <Cursor x={x + 22} y={y + 2} pressed={scene <= 3} pressKey={scene} />
        </g>
    );
}

// ── 자동 배정: 시수표 줄이 격자로 ────────────────────────────
export function DemandToGridDraw({ scene }: { scene: number }) {
    const gx = 176, gy = 24, cw = 28, ch = 22, days = ['월', '화', '수', '목'];
    const rows = [
        { t: '가람·영어·6-1·3', y: 34 },
        { t: '누리·과학·6-1·2', y: 58 },
        { t: '한결·체육·6-1·3', y: 82 },
    ];
    // 8개 칸: 영어3 · 과학2 · 체육3 → 격자 앞 두 줄을 채운다
    const chips: Array<{ col: number; row: number; label: string; src: number }> = [
        { col: 0, row: 0, label: '영', src: 0 }, { col: 1, row: 0, label: '영', src: 0 }, { col: 2, row: 0, label: '영', src: 0 },
        { col: 3, row: 0, label: '과', src: 1 }, { col: 0, row: 1, label: '과', src: 1 },
        { col: 1, row: 1, label: '체', src: 2 }, { col: 2, row: 1, label: '체', src: 2 }, { col: 3, row: 1, label: '체', src: 2 },
    ];
    const flew = scene >= 2;
    const remain = scene >= 3 ? 0 : 8;
    return (
        <g>
            <Title>시수표 세 줄이 자동 배정으로 시간표가 됩니다</Title>
            {rows.map((r, i) => (
                <g key={`r${i}`}>
                    <rect x={8} y={r.y} width={150} height={18} rx={4} fill={C.panel} stroke={C.line} />
                    <Txt x={14} y={r.y + 9} size={9} anchor="start" fill={C.text}>{r.t}</Txt>
                </g>
            ))}
            <Btn x={8} y={112} w={150} h={20} label="자동 배정 시작" active={scene >= 1} />
            <Grid gx={gx} gy={gy} days={days} rows={4} cw={cw} ch={ch} />
            {scene >= 4 && [2, 3].map((r) => days.map((_, c) => (
                <Cell key={`h${r}${c}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={C.home} stroke={C.line} label="담임" labelFill={C.muted} />
            )))}
            {chips.map((ch2, i) => {
                const dst = [cellX(gx, ch2.col, cw), cellY(gy, ch2.row, ch)];
                const src = [150, rows[ch2.src].y];
                const p = flew ? dst : src;
                return (
                    <g key={`chip${i}`} className="demo-el" style={{ transform: `translate(${p[0]}px, ${p[1]}px)` }}>
                        <Cell x={0} y={0} w={cw} h={ch} fill={C.accent} op={0.85} labelFill="#fff" label={ch2.label} className="" />
                    </g>
                );
            })}
            <Txt x={gx + 2 * cw} y={gy - 6} size={10} fill={remain === 0 ? C.ok : C.muted}>
                {remain === 0 ? '남음 0 · 필수 0' : `남음 ${remain}`}
            </Txt>
        </g>
    );
}

// ── 자동 배정: 후보 고르기 ───────────────────────────────────
export function PickCandidateDraw({ scene }: { scene: number }) {
    const cards = [
        { y: 16, hard: '필수 0', soft: '권장 4,812', rec: true },
        { y: 62, hard: '필수 0', soft: '권장 5,030', rec: false },
        { y: 108, hard: '필수 2', soft: '권장 4,510', rec: false },
    ];
    const applied = scene >= 2;
    return (
        <g>
            <Title>후보 여러 장 가운데 하나를 고릅니다</Title>
            {!applied && cards.map((c, i) => (
                <Card key={`cd${i}`} x={12} y={c.y} w={180} h={40} accent={c.rec}>
                    {c.rec && (
                        <g>
                            <rect x={150} y={c.y + 6} width={34} height={13} rx={6} fill={C.accent} />
                            <Txt x={167} y={c.y + 13} size={8} fill="#fff">추천</Txt>
                        </g>
                    )}
                    <Txt x={20} y={c.y + 15} size={10} anchor="start"
                        fill={c.hard === '필수 0' ? C.ok : C.bad}>{c.hard}</Txt>
                    <Txt x={20} y={c.y + 29} size={9} anchor="start" fill={C.muted}>{c.soft}</Txt>
                    {i === 0 && <Btn x={200} y={c.y + 10} w={104} h={20} label="이 후보로 진행" active={scene >= 1} />}
                </Card>
            ))}
            {applied && (
                <g>
                    <Grid gx={40} gy={30} days={DAYS5} rows={4} cw={44} ch={26} />
                    {[[0, 0], [1, 1], [2, 0], [3, 2], [4, 1], [1, 3]].map(([c, r], i) => (
                        <Cell key={`f${i}`} x={cellX(40, c, 44)} y={cellY(30, r, 26)} w={44} h={26}
                            fill={C.accent} op={0.8} labelFill="#fff" label="전담" />
                    ))}
                    <Txt x={160} y={168} size={11} fill={C.ok}>필수 위반 0건</Txt>
                </g>
            )}
            {scene <= 1 && <Cursor x={280} y={cards[0].y + 12} pressed={scene === 1} pressKey={scene} />}
        </g>
    );
}

// 커서 위치 선택 헬퍼
function curPos(scene: number, table: Array<[number, number, boolean]>): [number, number, boolean] {
    return table[scene] ?? table[table.length - 1];
}
