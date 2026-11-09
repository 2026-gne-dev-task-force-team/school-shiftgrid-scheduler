/**
 * 피크 머리줄 자리 — 미리보기(PeekLayer)의 맨 위 줄 왼쪽을 노드 틀(nodes.Frame)이 빌려 쓴다(Q5 R1: 탭과 옆으로 열기가 같은 틀).
 *   틀이 usePeekBar() 로 자리(slot)를 받아 거기에 경로·액션바를 포털로 그리면, 피크는 「미리보기」 글자를 감춘다(줄이 둘이 안 되게).
 *   피크 밖이면 null — 틀이 제 자리에 제 윗줄을 그린다.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface PeekBar { slot: HTMLElement; claim: () => () => void }
const Ctx = createContext<PeekBar | null>(null);

/** 피크 안이면 머리줄 자리를 돌려준다(없으면 null). 쓰는 동안 피크는 제 「미리보기」 글자를 감춘다. */
export function usePeekBar(): HTMLElement | null {
    const bar = useContext(Ctx);
    const claim = bar?.claim;
    useEffect(() => (claim ? claim() : undefined), [claim]);
    return bar?.slot ?? null;
}

/** PeekLayer 가 머리줄 자리를 만들어 자식에게 준다. */
export function PeekBarProvider({ slot, claim, children }: { slot: HTMLElement | null; claim: () => () => void; children: ReactNode }) {
    const value = useMemo(() => (slot ? { slot, claim } : null), [slot, claim]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 자리 state + 쓰는 자 수 — PeekLayer 안에서 한 번 부른다. */
export function usePeekBarState() {
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    const [claims, setClaims] = useState(0);
    const claim = useMemo(() => () => { setClaims((n) => n + 1); return () => setClaims((n) => n - 1); }, []);
    return { slot, setSlot, claim, claimed: claims > 0 };
}
