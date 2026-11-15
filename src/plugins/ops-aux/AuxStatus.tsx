/** 상태바 배지 — 오늘부터 14일 안 「재배정 필요」 건수. 0건이면 숨긴다(경고등은 있을 때만). 자료가 바뀌면 다시 센다. */
import { useEffect, useState } from 'react';
import { reassignNeededCount } from './ops';
import { defaultAuxSource, type AuxSource } from './source';

const todayKst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

export function AuxStatus({ source, today }: { source?: AuxSource; today?: string } = {}) {
    const src = source ?? defaultAuxSource;
    const [n, setN] = useState(0);
    useEffect(() => {
        let live = true;
        const count = async () => { const n2 = reassignNeededCount(await src.load(), today ?? todayKst(), src.lessonsOn); if (live) setN(n2); };
        void count();
        const off = src.subscribe?.(() => { void count(); });
        return () => { live = false; off?.(); };
    }, [src, today]);
    if (n === 0) return null;
    return <span data-testid="aux-status" className="tabular-nums select-none">재배정 필요 {n}건</span>;
}
