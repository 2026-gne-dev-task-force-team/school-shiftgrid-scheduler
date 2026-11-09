/**
 * 토스트 — 알림이 잠깐 뜨는 자리. 넓으면 오른쪽 아래(상태바 위), 좁으면 위. 동시에 최대 4개(스토어가 막는다).
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · 도메인 낱말 0(⑤). 오류는 role=alert 로 읽어 준다.
 */
import { useEffect, useRef, useState } from 'react';
import { useNarrow } from '../../layout/useScreen';
import { useNotifications, dismiss, runNotifyAction, actionState, type NotifyLevel } from '../../plugin/notify';
import { listPlugins } from '../../plugin/registry';
import { FOCUS_RING } from '../../primitives/focus';
import { Icon, type IconName } from '../../primitives/Icon';

export const LEVEL_STYLE: Record<NotifyLevel, { icon: IconName; bar: string; text: string }> = {
    info: { icon: 'info', bar: 'border-l-accent', text: 'text-accent' },
    success: { icon: 'check', bar: 'border-l-ok', text: 'text-ok' },
    warn: { icon: 'warn', bar: 'border-l-warn', text: 'text-warn' },
    error: { icon: 'warn', bar: 'border-l-bad', text: 'text-bad' },
};

/** 보낸 꾸러미의 사람 이름 — 모르면 비운다 */
export function ownerName(owner: string): string {
    return listPlugins().find((p) => p.id === owner)?.name ?? '';
}

/** 퇴장 전환 길이(ms) — --motion-fast(.12s) 와 같다. 이 동안 토스트는 남아 .ui-pop-out 으로 사라지고 클릭을 무시한다. */
export const TOAST_EXIT_MS = 120;

/** 스토어에서 빠진 토스트를 잠깐 더 들고 있다가(leaving) 퇴장 전환 뒤 제거한다. */
export function useLeavingToasts<T extends { id: string }>(toasts: T[]): { item: T; leaving: boolean }[] {
    const [list, setList] = useState<{ item: T; leaving: boolean }[]>(() => toasts.map((item) => ({ item, leaving: false })));
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    useEffect(() => {
        const live = new Map(toasts.map((t) => [t.id, t]));
        setList((prev) => {
            const out: { item: T; leaving: boolean }[] = [];
            const seen = new Set<string>();
            for (const p of prev) {
                seen.add(p.item.id);
                const cur = live.get(p.item.id);
                out.push(cur ? { item: cur, leaving: false } : { item: p.item, leaving: true });
            }
            for (const t of toasts) if (!seen.has(t.id)) out.push({ item: t, leaving: false });
            return out;
        });
    }, [toasts]);
    useEffect(() => {
        for (const p of list) {
            if (p.leaving && !timers.current.has(p.item.id)) {
                const id = p.item.id;
                timers.current.set(id, setTimeout(() => {
                    timers.current.delete(id);
                    setList((prev) => prev.filter((x) => !(x.item.id === id && x.leaving)));
                }, TOAST_EXIT_MS));
            }
        }
    }, [list]);
    useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);
    return list;
}

export function Toasts() {
    const { toasts } = useNotifications();
    const narrow = useNarrow();
    const shown = useLeavingToasts(toasts);
    if (shown.length === 0) return null;
    return (
        <div
            aria-live="polite"
            className={`fixed z-toast flex flex-col gap-2 pointer-events-none ${narrow ? 'top-2 inset-x-2' : 'right-3 w-[340px]'}`}
            // 상태바 높이는 토큰 변수 — 숨겨 있어도 한 줄 여유라 겹치지 않는다
            style={narrow ? undefined : { bottom: 'calc(var(--s-statusbar) + 0.75rem)' }}
        >
            {shown.map(({ item: t, leaving }) => {
                const st = LEVEL_STYLE[t.level];
                const who = ownerName(t.owner);
                const act = actionState(t);
                return (
                    <div
                        key={t.id}
                        role={t.level === 'error' ? 'alert' : 'status'}
                        className={`${leaving ? 'ui-pop-out pointer-events-none' : 'ui-pop-in pointer-events-auto'} flex items-start gap-2 rounded-md border border-line border-l-4 ${st.bar} bg-panel shadow-lg px-3 py-2 text-body text-text`}
                    >
                        <Icon name={st.icon} size={16} className={`mt-0.5 shrink-0 ${st.text}`} />
                        <div className="flex-1 min-w-0">
                            <div className="font-medium break-words">{t.title}</div>
                            {t.body && <div className="mt-0.5 text-small text-muted break-words">{t.body}</div>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {t.action && (
                                    <button
                                        type="button"
                                        disabled={act.kind !== 'ready'}
                                        title={act.kind === 'stale' ? act.reason : undefined}
                                        onClick={() => runNotifyAction(t.id)}
                                        className={`h-6 px-2 rounded border border-line text-small whitespace-nowrap shrink-0 hover:bg-text/[0.06] disabled:opacity-40 disabled:pointer-events-none ${FOCUS_RING}`}
                                    >
                                        {t.action.label}
                                    </button>
                                )}
                                {act.kind === 'stale' && <span className="text-note text-muted">{act.reason}</span>}
                                {who && <span className="text-note text-muted whitespace-nowrap">{who}</span>}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="알림 닫기"
                            onClick={() => dismiss(t.id)}
                            className={`hit-44 relative shrink-0 rounded text-muted hover:text-text ${FOCUS_RING}`}
                        >
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
