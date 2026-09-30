/**
 * 움직이는 사용법 그림 (2) — homeroom-fill · sheet-paste · spec-time · co-teach.
 */
import { C, fillA, cellX, cellY, DAYS5 } from './palette';
import { Grid, Cell, Cursor, Card, Txt, Title } from './parts';

// ── 담임 채우기 ──────────────────────────────────────────────
export function HomeroomFillDraw({ scene }: { scene: number }) {
    const gx = 40, gy = 26, cw = 44, ch = 26, rows = 4;
    const special: Array<[number, number, string]> = [
        [0, 0, '영어'], [2, 0, '과학'], [4, 0, '체육'], [1, 1, '음악'], [3, 1, '미술'], [0, 2, '실과'],
    ];
    const isSpecial = (c: number, r: number) => special.some(([sc, sr]) => sc === c && sr === r);
    const home: Array<[number, number]> = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) if (!isSpecial(c, r)) home.push([c, r]);
    return (
        <g>
            <Title>6-1 — 전담 수업 뒤 남은 칸이 모두 담임입니다</Title>
            <Grid gx={gx} gy={gy} days={DAYS5} rows={rows} cw={cw} ch={ch} />
            {scene >= 2 && home.map(([c, r], i) => (
                <Cell key={`hm${i}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={C.home} stroke={C.line} label="담임" labelFill={C.muted} />
            ))}
            {scene >= 1 && special.map(([c, r, name], i) => (
                <Cell key={`sp${i}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={C.accent} op={0.85} labelFill="#fff" label={name} />
            ))}
        </g>
    );
}

// ── 엑셀에서 시수표로 붙이기 ─────────────────────────────────
export function SheetPasteDraw({ scene }: { scene: number }) {
    const ex = 10, ey = 34, ecw = 28, ech = 16, ecols = 5, erows = 3;
    const data = [
        ['가람', '영어', '6', '1', '3'], ['누리', '과학', '6', '1', '2'], ['한결', '체육', '6', '1', '3'],
    ];
    const dx = 176, dy = 34;   // 시수표 위치
    const selected = scene <= 1;
    const pasted = scene >= 3;
    return (
        <g>
            <Title>엑셀 범위를 복사해 시수표에 붙입니다</Title>
            {/* 엑셀 표 */}
            {data.map((row, r) => row.map((v, c) => (
                <g key={`e${r}${c}`}>
                    <rect x={ex + c * ecw} y={ey + r * ech} width={ecw} height={ech} fill={C.panel} stroke={C.line} strokeWidth={0.7} />
                    <Txt x={ex + c * ecw + ecw / 2} y={ey + r * ech + ech / 2} size={8} fill={C.text}>{v}</Txt>
                </g>
            )))}
            {selected && (
                <rect className="demo-el" x={ex - 1} y={ey - 1} width={ecols * ecw + 2} height={erows * ech + 2}
                    rx={2} fill="none" stroke={C.accent} strokeWidth={2} />
            )}
            {scene === 1 && <Badge x={ex + 20} y={ey + erows * ech + 10} text="Ctrl+C" />}
            {/* 시수표 */}
            <Txt x={dx} y={dy - 6} size={9} anchor="start" fill={C.muted}>시수표</Txt>
            {[0, 1, 2].map((r) => (
                <g key={`d${r}`}>
                    <rect x={dx} y={dy + r * 20} width={132} height={18} rx={3}
                        fill={r === 0 && scene === 2 ? fillA('accent', 0.15) : C.panel}
                        stroke={r === 0 && scene === 2 ? C.accent : C.line} />
                    {pasted && (
                        <Txt x={dx + 6} y={dy + r * 20 + 9} size={9} anchor="start" fill={C.text}>
                            {data[r][0]}·{data[r][1]}·6-{data[r][3]}·{data[r][4]}
                        </Txt>
                    )}
                </g>
            ))}
            {scene === 3 && <Badge x={dx + 30} y={dy + 3 * 20 + 12} text="Ctrl+V" />}
            {scene >= 4 && <Txt x={dx} y={dy + 3 * 20 + 14} size={10} anchor="start" fill={C.ok}>배정/필요 — 남음 8</Txt>}
            {scene === 2 && <Cursor x={dx + 12} y={dy + 4} pressed pressKey={scene} />}
        </g>
    );
}

function Badge({ x, y, text }: { x: number; y: number; text: string }) {
    return (
        <g className="demo-el">
            <rect x={x} y={y} width={44} height={15} rx={4} fill={C.accent} />
            <Txt x={x + 22} y={y + 8} size={9} fill="#fff">{text}</Txt>
        </g>
    );
}

// ── 시간 틀: 겹침은 시각으로 ─────────────────────────────────
export function SpecTimeDraw({ scene }: { scene: number }) {
    const x0 = 30, x1 = 300, w = x1 - x0;
    const y1 = 66, y2 = 116, bh = 24;
    const seg = (n: number, i: number) => x0 + (w / n) * i;
    const segW = (n: number) => w / n;
    // 겹침 예: 1·2학년 4교시(index3) vs 5·6학년 5교시(index4)
    const badBar1 = [seg(5, 3), segW(5)] as const;
    const badBar2 = [seg(6, 4), segW(6)] as const;
    return (
        <g>
            <Title>학년마다 같은 3교시가 다른 시각입니다</Title>
            <Txt x={x0} y={44} size={8} anchor="start" fill={C.muted}>09:00</Txt>
            <Txt x={x1} y={44} size={8} anchor="end" fill={C.muted}>14:30</Txt>
            {/* 두 시간 틀 막대 */}
            <PeriodBar y={y1} n={5} x0={x0} w={w} label="1·2학년" />
            <PeriodBar y={y2} n={6} x0={x0} w={w} label="5·6학년" />
            {scene >= 1 && (
                <g className="demo-el">
                    <line x1={seg(5, 2) + segW(5) / 2} y1={y1 - 6} x2={seg(5, 2) + segW(5) / 2} y2={y2 + bh + 6}
                        stroke={C.muted} strokeWidth={0.8} strokeDasharray="3 3" />
                    <line x1={seg(6, 2) + segW(6) / 2} y1={y1 - 6} x2={seg(6, 2) + segW(6) / 2} y2={y2 + bh + 6}
                        stroke={C.muted} strokeWidth={0.8} strokeDasharray="3 3" />
                </g>
            )}
            {scene === 2 && (
                <g>
                    <Mark x={seg(5, 2) + segW(5) / 2} y={y1 + bh / 2} ok />
                    <Mark x={seg(6, 2) + segW(6) / 2} y={y2 + bh / 2} ok />
                </g>
            )}
            {scene >= 3 && (
                <g>
                    <rect className="demo-el" x={badBar1[0]} y={y1} width={badBar1[1]} height={bh} fill={fillA('bad', 0.4)} stroke={C.bad} />
                    <rect className="demo-el" x={badBar2[0]} y={y2} width={badBar2[1]} height={bh} fill={fillA('bad', 0.4)} stroke={C.bad} />
                    <Mark x={badBar1[0] + badBar1[1] / 2} y={y1 + bh / 2} ok={false} />
                    <Mark x={badBar2[0] + badBar2[1] / 2} y={y2 + bh / 2} ok={false} />
                </g>
            )}
        </g>
    );
}

function PeriodBar({ y, n, x0, w, label }: { y: number; n: number; x0: number; w: number; label: string }) {
    const bh = 24, sw = w / n;
    return (
        <g>
            <Txt x={x0 - 4} y={y - 6} size={9} anchor="start" fill={C.muted}>{label}</Txt>
            {Array.from({ length: n }, (_, i) => (
                <g key={i}>
                    <rect x={x0 + i * sw} y={y} width={sw} height={bh} fill={C.panel2} stroke={C.line} strokeWidth={0.7} />
                    <Txt x={x0 + i * sw + sw / 2} y={y + bh / 2} size={9} fill={C.muted}>{i + 1}</Txt>
                </g>
            ))}
        </g>
    );
}

function Mark({ x, y, ok }: { x: number; y: number; ok: boolean }) {
    return (
        <g className="demo-el">
            <circle cx={x} cy={y - 20} r={7} fill={ok ? C.ok : C.bad} />
            <Txt x={x} y={y - 20} size={9} fill="#fff">{ok ? '✓' : '✗'}</Txt>
        </g>
    );
}

// ── 함께 수업 ────────────────────────────────────────────────
export function CoTeachDraw({ scene }: { scene: number }) {
    const days = ['월', '화', '수'];
    const g1 = 24, g2 = 184, gy = 44, cw = 30, ch = 24;
    const busy1: Array<[number, number]> = [[0, 0], [2, 1]];
    const busy2: Array<[number, number]> = [[1, 0], [0, 2]];
    const cand: Array<[number, number]> = [[1, 2], [2, 2]];
    const place: [number, number] = [1, 2];
    const drawGrid = (gx: number, busy: Array<[number, number]>, who: string) => (
        <g>
            <Txt x={gx} y={gy - 6} size={9} anchor="start" fill={C.muted}>{who}</Txt>
            <Grid gx={gx} gy={gy} days={days} rows={3} cw={cw} ch={ch} />
            {busy.map(([c, r], i) => (
                <Cell key={`b${who}${i}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={C.panel2} stroke={C.line} label="•" labelFill={C.muted} />
            ))}
            {scene >= 2 && cand.map(([c, r], i) => (
                <Cell key={`g${who}${i}`} x={cellX(gx, c, cw)} y={cellY(gy, r, ch)} w={cw} h={ch}
                    fill={fillA('ok', 0.35)} stroke={C.ok} />
            ))}
            {scene >= 3 && (
                <Cell x={cellX(gx, place[0], cw)} y={cellY(gy, place[1], ch)} w={cw} h={ch}
                    fill={C.accent} op={0.85} labelFill="#fff" label="영어" />
            )}
        </g>
    );
    return (
        <g>
            <Title>두 교사가 모두 비는 칸에만 배정됩니다</Title>
            <Card x={12} y={12} w={296} h={22} accent={scene === 1}>
                <Txt x={20} y={23} size={9} anchor="start" fill={C.text}>
                    영어 · 가람 · 함께 수업: {scene >= 1 ? '원어민' : '(비어 있음)'}
                </Txt>
            </Card>
            {drawGrid(g1, busy1, '가람')}
            {drawGrid(g2, busy2, '원어민')}
            {scene === 1 && <Cursor x={250} y={24} pressed pressKey={scene} />}
        </g>
    );
}
