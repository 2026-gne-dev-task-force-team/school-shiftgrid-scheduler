/**
 * 움직이는 사용법 그림 (3) — block-move · diagnose-fix · save-board · print-export.
 */
import { C, fillA, cellX, cellY, DAYS5 } from './palette';
import { Grid, Cell, Cursor, Card, Btn, Txt, Title } from './parts';

// ── 연속 수업 옮기기 ────────────────────────────────────────
export function BlockMoveDraw({ scene }: { scene: number }) {
    const gx = 24, gy = 26, cw = 40, ch = 24, rows = 4;
    // 점심은 2교시와 3교시 사이(row1 아래)
    const lunchY = cellY(gy, 2, ch);
    const oCol = 1, oR0 = 2;           // 화요일 3·4교시
    const tCol = 3, tR0 = 0;           // 목요일 1·2교시
    const ox = cellX(gx, oCol, cw), oy = cellY(gy, oR0, ch);
    const tx = cellX(gx, tCol, cw), ty = cellY(gy, tR0, ch);
    const moved = scene >= 3;
    return (
        <g>
            <Title>연속 수업 「실과 2」는 붙은 채로 움직입니다</Title>
            <Grid gx={gx} gy={gy} days={DAYS5} rows={rows} cw={cw} ch={ch} />
            <line x1={gx} y1={lunchY} x2={gx + 5 * cw} y2={lunchY} stroke={C.warn} strokeWidth={1} strokeDasharray="4 3" />
            <Txt x={gx + 5 * cw + 2} y={lunchY} size={8} anchor="start" fill={C.warn}>점심</Txt>
            {scene === 1 && (
                <Cell x={tx} y={ty} w={cw} h={ch * 2} fill={fillA('ok', 0.35)} stroke={C.ok} label="여기" labelFill={C.ok} />
            )}
            {scene === 2 && (
                <g>
                    <Cell x={tx} y={ty} w={cw} h={ch * 2} fill={fillA('ok', 0.35)} stroke={C.ok} label="여기" labelFill={C.ok} />
                    <Cell x={cellX(gx, 2, cw)} y={cellY(gy, 1, ch)} w={cw} h={ch * 2} fill={fillA('bad', 0.35)} stroke={C.bad} label="점심 넘음" labelFill={C.bad} />
                </g>
            )}
            <g className="demo-el" style={{ transform: `translate(${moved ? tx - ox : 0}px, ${moved ? ty - oy : 0}px)` }}>
                <rect x={ox - 2} y={oy - 2} width={cw + 4} height={ch * 2 + 4} rx={7} fill="none"
                    stroke={C.accent} strokeWidth={2} />
                <Cell x={ox} y={oy} w={cw} h={ch} fill={C.accent} op={0.85} labelFill="#fff" label="실과" className="" />
                <Cell x={ox} y={oy + ch} w={cw} h={ch} fill={C.accent} op={0.85} labelFill="#fff" label="실과" className="" />
            </g>
        </g>
    );
}

// ── 점검에서 고치기 ─────────────────────────────────────────
export function DiagnoseFixDraw({ scene }: { scene: number }) {
    const rules = [
        { t: '같은 교사 같은 시각 두 반', kind: '필수', n: scene >= 3 ? 0 : 2, bad: true },
        { t: '특별실 정원 초과', kind: '필수', n: 0, bad: true },
        { t: '연속 수업 제한', kind: '권장', n: 3, bad: false },
    ];
    const showGrid = scene >= 2;
    return (
        <g>
            <Title>점검에서 문제를 찾아 고칩니다</Title>
            {!showGrid && rules.map((r, i) => (
                <g key={`ru${i}`}>
                    <rect x={12} y={24 + i * 24} width={296} height={20} rx={4}
                        fill={i === 0 && scene === 1 ? fillA('bad', 0.12) : C.panel} stroke={C.line} />
                    <Txt x={20} y={34 + i * 24} size={9} anchor="start" fill={C.text}>{r.t}</Txt>
                    <Txt x={230} y={34 + i * 24} size={9} anchor="start" fill={r.bad ? C.bad : C.warn}>{r.kind}</Txt>
                    <Txt x={300} y={34 + i * 24} size={9} anchor="end" fill={r.n > 0 && r.bad ? C.bad : C.muted}>{r.n}건</Txt>
                </g>
            ))}
            {scene === 1 && (
                <g className="demo-el">
                    <Txt x={28} y={98} size={8} anchor="start" fill={C.muted}>· 가람 — 화 3교시 · 6-1 / 6-2</Txt>
                    <Txt x={28} y={112} size={8} anchor="start" fill={C.muted}>· 누리 — 목 2교시 · 6-1 / 6-3</Txt>
                    <Cursor x={160} y={26} pressed pressKey={scene} />
                </g>
            )}
            {showGrid && (
                <g>
                    <Grid gx={40} gy={30} days={DAYS5} rows={4} cw={44} ch={26} />
                    {[[1, 2], [3, 1]].map(([c, r], i) => {
                        const fixedOne = scene >= 3 && i === 0;
                        return (
                            <Cell key={`pc${i}`} x={cellX(40, fixedOne ? c + 1 : c, 44)} y={cellY(30, r, 26)} w={44} h={26}
                                fill={scene >= 3 ? C.accent : fillA('bad', 0.35)} op={scene >= 3 ? 0.8 : 1}
                                stroke={scene >= 3 ? C.line : C.bad} labelFill={scene >= 3 ? '#fff' : C.bad}
                                label="6-1" blink={scene === 2} />
                        );
                    })}
                    <Btn x={110} y={166} w={100} h={18} label="자동 개선" active={scene === 3} />
                    <Txt x={230} y={175} size={10} anchor="start" fill={scene >= 3 ? C.ok : C.bad}>
                        {scene >= 3 ? '2건 → 0건' : '필수 2건'}
                    </Txt>
                </g>
            )}
        </g>
    );
}

// ── 시안 저장·확정본 ────────────────────────────────────────
export function SaveBoardDraw({ scene }: { scene: number }) {
    const name = '1차 시안';
    const cards = [
        { title: '1차 시안', show: scene >= 1 },
        { title: '부장 회의 반영', show: scene >= 2, pub: scene >= 3 },
    ];
    return (
        <g>
            <Title>시안을 이름 붙여 보관하고 확정본을 정합니다</Title>
            <rect x={12} y={24} width={190} height={22} rx={4} fill={C.panel} stroke={scene === 0 ? C.accent : C.line} />
            <Txt x={20} y={35} size={10} anchor="start" fill={C.text}>{name}{scene === 0 ? '|' : ''}</Txt>
            <Btn x={210} y={25} w={96} h={20} label="시안 저장" active={scene >= 1} />
            {cards.map((c, i) => c.show && (
                <Card key={`bd${i}`} x={12} y={58 + i * 46} w={294} h={40} accent={c.pub}>
                    <Txt x={20} y={58 + i * 46 + 15} size={10} anchor="start" fill={C.text}>{c.title}</Txt>
                    {!c.pub && <Btn x={186} y={58 + i * 46 + 10} w={110} h={18} label="확정본으로 지정" active={i === 1 && scene >= 2} />}
                    {c.pub && (
                        <g className="demo-el">
                            <circle cx={276} cy={58 + i * 46 + 20} r={13} fill="none" stroke={C.bad} strokeWidth={1.5} />
                            <Txt x={276} y={58 + i * 46 + 20} size={8} fill={C.bad} weight={700}>확정</Txt>
                        </g>
                    )}
                </Card>
            ))}
            {scene === 3 && <Cursor x={236} y={58 + 46 + 12} pressed pressKey={scene} />}
        </g>
    );
}

// ── 인쇄·내보내기 ───────────────────────────────────────────
export function PrintExportDraw({ scene }: { scene: number }) {
    const views = ['반별', '교사별', '특별실별'];
    const active = scene >= 1 ? 1 : 0;
    const printed = scene >= 2;
    const head = scene >= 1 ? ['교사', '월', '화', '수'] : ['반', '월', '화', '수'];
    const rowLabel = scene >= 1 ? ['가람', '누리', '한결'] : ['6-1', '6-2', '6-3'];
    const line = printed ? '#000' : C.line;
    const cellFill = printed ? '#fff' : C.panel;
    const cx = 12, cy = 60, cw = 74, chh = 20;
    return (
        <g>
            <Title>보기를 바꾸고 인쇄하거나 파일로 내보냅니다</Title>
            {/* 보기 토글 */}
            <g>
                {views.map((v, i) => (
                    <g key={`v${i}`}>
                        <rect x={12 + i * 62} y={24} width={62} height={20}
                            fill={i === active ? C.accent : C.panel2} stroke={C.line}
                            rx={i === 0 ? 5 : 0} className="demo-el" />
                        <Txt x={12 + i * 62 + 31} y={34} size={9} fill={i === active ? '#fff' : C.muted}>{v}</Txt>
                    </g>
                ))}
                <Btn x={210} y={24} w={44} h={20} label="인쇄" active={scene >= 2} />
                <Btn x={258} y={24} w={50} h={20} label="엑셀" active={scene >= 3} tone="ghost" />
            </g>
            {/* 표 */}
            {head.map((h, c) => (
                <g key={`th${c}`}>
                    <rect x={cx + c * cw} y={cy} width={cw} height={chh} fill={printed ? '#fff' : C.panel2} stroke={line} strokeWidth={0.8} />
                    <Txt x={cx + c * cw + cw / 2} y={cy + chh / 2} size={9} fill={printed ? '#000' : C.text}>{h}</Txt>
                </g>
            ))}
            {rowLabel.map((rl, r) => head.map((_, c) => (
                <g key={`td${r}${c}`}>
                    <rect x={cx + c * cw} y={cy + chh + r * chh} width={cw} height={chh} fill={cellFill} stroke={line} strokeWidth={0.8} className="demo-el" />
                    <Txt x={cx + c * cw + cw / 2} y={cy + chh + r * chh + chh / 2} size={8} fill={printed ? '#000' : C.text}>
                        {c === 0 ? rl : (r === c ? '전담' : '')}
                    </Txt>
                </g>
            )))}
            {scene >= 3 && (
                <g className="demo-el">
                    <rect x={270} y={150} width={26} height={30} rx={3} fill={C.panel} stroke={C.ok} strokeWidth={1.5} />
                    <Txt x={283} y={165} size={8} fill={C.ok}>xls</Txt>
                </g>
            )}
        </g>
    );
}
