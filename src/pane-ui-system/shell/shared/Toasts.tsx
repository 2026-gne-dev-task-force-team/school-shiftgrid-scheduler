/**
 * 토스트 — 알림이 잠깐 뜨는 자리. 넓으면 오른쪽 아래(상태바 위), 좁으면 위. 동시에 최대 4개(스토어가 막는다).
 * 🔴 ⛔ 색은 토큰으로만(구조 검사 ①) · 도메인 낱말 0(⑤). 오류는 role=alert 로 읽어 준다.
 */
import { useNarrow } from '../../layout/useScreen';
import { useNotifications, dismiss, runNotifyAction, type NotifyLevel } from '../../plugin/notify';
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

export function Toasts() {
    const { toasts } = useNotifications();
    const narrow = useNarrow();
    if (toasts.length === 0) return null;
    return (
        <div
            aria-live="polite"
            className={`fixed z-[250] flex flex-col gap-2 pointer-events-none ${narrow ? 'top-2 inset-x-2' : 'right-3 w-[340px]'}`}
            // 상태바 높이는 토큰 변수 — 숨겨 있어도 한 줄 여유라 겹치지 않는다
            style={narrow ? undefined : { bottom: 'calc(var(--s-statusbar) + 0.75rem)' }}
        >
            {toasts.map((t) => {
                const st = LEVEL_STYLE[t.level];
                const who = ownerName(t.owner);
                return (
                    <div
                        key={t.id}
                        role={t.level === 'error' ? 'alert' : 'status'}
                        className={`pointer-events-auto flex items-start gap-2 rounded-md border border-line border-l-4 ${st.bar} bg-panel shadow-lg px-3 py-2 text-body text-text`}
                    >
                        <Icon name={st.icon} size={16} className={`mt-0.5 shrink-0 ${st.text}`} />
                        <div className="flex-1 min-w-0">
                            <div className="font-medium break-words">{t.title}</div>
                            {t.body && <div className="mt-0.5 text-small text-muted break-words">{t.body}</div>}
                            <div className="mt-1 flex items-center gap-2">
                                {t.action && (
                                    <button
                                        type="button"
                                        onClick={() => runNotifyAction(t.id)}
                                        className={`h-6 px-2 rounded border border-line text-small hover:bg-text/[0.06] ${FOCUS_RING}`}
                                    >
                                        {t.action.label}
                                    </button>
                                )}
                                {who && <span className="text-note text-muted">{who}</span>}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="알림 닫기"
                            onClick={() => dismiss(t.id)}
                            className={`shrink-0 rounded text-muted hover:text-text ${FOCUS_RING}`}
                        >
                            <Icon name="x" size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
