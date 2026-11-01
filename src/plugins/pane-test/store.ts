/**
 * 열린 시험 뷰 수 — 상태바가 비추는 작은 스토어(스케줄러 「카드 N」과 같은 결).
 *   🔴 활성(index.ts)이 host.workspace.on('open'/'close') 로 세서 여기 넣고, 상태바 컴포넌트가 구독해 다시 그린다.
 *   이 한 조각이 「상태바 + 이벤트 구독」 기여점을 자기 몸으로 증명한다.
 */
import { useSyncExternalStore } from 'react';

/** 피크 넓음/좁음 가름 폭 — 이 칸 폭이 이 값 이상이면 오른쪽, 아래면 바닥(쥔님: 기준값은 설정으로 뺀다). host.storage 키. */
export const PEEK_WIDE_MIN_KEY = 'peekWideMin';
export const PEEK_WIDE_MIN_DEFAULT = 420;

let count = 0;
const listeners = new Set<() => void>();

export function setOpenViewCount(n: number): void {
    if (n === count) return;
    count = n;
    for (const l of listeners) l();
}

export function useOpenViewCount(): number {
    return useSyncExternalStore(
        (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
        () => count,
        () => count,
    );
}
