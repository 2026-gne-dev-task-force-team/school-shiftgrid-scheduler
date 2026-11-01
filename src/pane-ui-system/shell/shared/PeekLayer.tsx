/**
 * 피크(미리보기) 겹침 — 🔴 ⭐ **그 탭 안에서** 뜬다(전역 창 아님, 쥔님 2026-11-01).
 *   EditorArea 가 제 칸 위에 absolute 로 얹는다 — 탭 줄·패널 머리줄과 높이를 맞추지 않는다(내용 위에 겹친다).
 *   wide=true(그 탭 칸이 넓다) → 오른쪽에서 떠서 나온다 · wide=false(좁다) → 아래에서 올라온다.
 *   🔴 색·치수는 토큰 클래스로만(구조 검사 ①).
 */
import type { ReactNode } from 'react';
import { IconButton } from '../../primitives/IconButton';

export function PeekLayer({ wide, onClose, children }: { wide: boolean; onClose: () => void; children: ReactNode }) {
    return (
        <div className="absolute inset-0 z-30 pointer-events-none">
            {/* 피크 밖을 눌러 닫는다 — 옅은 가림막(토큰 불투명도). 아래 내용은 그대로 보인다 */}
            <div className="absolute inset-0 bg-text/10 pointer-events-auto peek-scrim" onClick={onClose} aria-hidden="true" />
            <div
                className={wide
                    ? 'absolute top-0 right-0 bottom-0 w-[min(380px,72%)] bg-panel border-l border-line shadow-xl flex flex-col pointer-events-auto peek-from-right'
                    : 'absolute left-0 right-0 bottom-0 h-[62%] bg-panel border-t border-line shadow-xl flex flex-col pointer-events-auto peek-from-bottom'}
                role="dialog"
                aria-label="미리보기"
            >
                <div className="shrink-0 flex items-center justify-between h-header px-pad border-b border-line select-none">
                    <span className="text-[12px] font-semibold text-muted">미리보기(피크){wide ? ' · 오른쪽' : ' · 아래'}</span>
                    <IconButton icon="x" label="피크 닫기" onClick={onClose} />
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-4 select-text">{children}</div>
            </div>
        </div>
    );
}
