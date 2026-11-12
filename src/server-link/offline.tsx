/**
 * 끊김 잠금·연결 상태 판 (1.2v 설계 ① 12절 · P9) — 상태바 넷(저장됨·올리는 중·안 올라간 변경 n칸·충돌) + 다시 로그인.
 *   네트워크·503 은 큐에서 둘 다 `offline` 이라 같은 문구다. 편집은 막지 않는다(사본에 쌓인다) — 판은 상태만 보인다.
 *   잠금이 필요한 건 충돌·오류 칸뿐 → `isLocked`. 로그인 화면·충돌 열기는 주입식, 화면 배선은 안 한다.
 */
import { useEffect, useState } from 'react';
import { Button } from '../pane-ui-system/primitives/Button';
import type { PartQueue, QueueStatus } from './parts';

export interface ConnectionBarProps {
    queue: Pick<PartQueue, 'status' | 'subscribe' | 'resume' | 'flush'>;
    /** 다시 로그인 화면을 연다 — 끝나면 풀린다. 그 뒤 `resume()`. */
    onRelogin: () => void | Promise<void>;
    /** 충돌 칸을 눌러 연다. */
    onOpenConflict: (part: string) => void;
}

/** 편집을 막아야 하는 칸인가 — 충돌·오류 칸만. offline·relogin 은 막지 않는다. */
export function isLocked(part: string, queue: Pick<PartQueue, 'partInfo'>): boolean {
    const s = queue.partInfo(part).state;
    return s === 'conflict' || s === 'error';
}

export function ConnectionBar({ queue, onRelogin, onOpenConflict }: ConnectionBarProps) {
    const [status, setStatus] = useState<QueueStatus>(() => queue.status());
    useEffect(() => {
        setStatus(queue.status());
        return queue.subscribe(() => setStatus(queue.status()));
    }, [queue]);

    const relogin = async () => { await onRelogin(); await queue.resume(); };
    const flushBtn = <Button onClick={() => { void queue.flush(); }}>지금 올리기</Button>;

    switch (status.kind) {
        case 'saved': return <div role="status">저장됨</div>;
        case 'saving': return <div role="status">올리는 중…</div>;
        case 'pending': return <div role="status">안 올라간 변경 {status.count}칸 {flushBtn}</div>;
        case 'offline':
            return <div role="status">서버에 닿지 않습니다 — 잠시 뒤 다시 올립니다 · 안 올라간 변경 {status.count}칸 {flushBtn}</div>;
        case 'relogin':
            return <div role="status">다시 로그인하면 이어서 올립니다 <Button onClick={() => { void relogin(); }}>다시 로그인</Button></div>;
        case 'conflict':
            return (
                <div role="status">충돌 {status.parts.length}칸
                    {status.parts.map(p => <Button key={p} onClick={() => onOpenConflict(p)}>{p}</Button>)}
                </div>
            );
        case 'error':
            return <div role="status">저장 오류 {status.parts.length}칸 — {status.parts.join(', ')}</div>;
    }
}
