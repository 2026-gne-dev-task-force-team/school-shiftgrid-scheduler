/**
 * 플러그인 줄·상세가 같이 쓰는 작은 부품 — 플러그인 줄과 「후라이팬」 줄/상세가 같은 모양이 되게 한 곳에(Q1·F4).
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import type { ReactNode } from 'react';
import { Icon, Button } from '../../..';

/** 상세 안 한 묶음 — 작은 대문자 제목 + 개수 */
export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-1.5">
            <h4 className="text-note font-semibold uppercase tracking-wide text-muted">
                {title}{count != null && <span className="ml-1 text-muted/70">{count}</span>}
            </h4>
            {children}
        </section>
    );
}

/** 카드 줄 하나 — 왼쪽: 이름 + 풀이 · 오른쪽 끝: 작은 회색 식별자 */
export function RelRow({ left, note, right }: { left: string; note?: string; right?: string }) {
    return (
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-line last:border-b-0">
            <div className="min-w-0 flex-1">
                <span className="text-small text-text">{left}</span>
                {note && <span className="text-note text-muted ml-2">{note}</span>}
            </div>
            {right && <span className="text-micro text-muted/70 font-mono shrink-0">{right}</span>}
        </div>
    );
}

/** 상세 머리 왼쪽 — 이름·판·배지(코어/바닥/실패) + 작은 식별자. 플러그인 상세와 플랫폼 상세가 같은 모양이다 */
export function DetailTitle({ name, version, id, badges }: { name: string; version: string; id: string; badges?: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lead font-semibold text-text">{name}</span>
                <span className="text-note text-muted">v{version}</span>
                {badges}
            </div>
            <span className="text-note text-muted font-mono">{id}</span>
        </div>
    );
}

/** 배지 하나 — 코어·바닥 */
export function Badge({ children }: { children: ReactNode }) {
    return <span className="text-note px-1.5 rounded bg-accent/15 text-accent">{children}</span>;
}

/** 줄 오른쪽 「자세히 ›」 단추 — 글자는 줄바꿈하지 않는다 */
export function DetailButton({ label, onClick, open, expanded }: { label: string; onClick: () => void; open?: boolean; expanded?: boolean }) {
    return (
        <Button size="sm" onClick={onClick} aria-expanded={expanded} aria-label={label} className="flex items-center gap-1">
            자세히
            <Icon name="right" size={12} className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
        </Button>
    );
}

/** 「끌 수 없음」 잠김 표시 — 구분선으로 토글 자리에서 떨어진다 */
export function LockedMark({ title }: { title?: string }) {
    return (
        <span className="shrink-0 pl-3 ml-1 border-l border-line">
            <span className="flex items-center gap-1 whitespace-nowrap text-note text-muted" title={title}><Icon name="pin" size={11} /> 끌 수 없음</span>
        </span>
    );
}
