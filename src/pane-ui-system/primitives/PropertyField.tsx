/**
 * PropertyField — 이름표 + 값 한 줄(인스펙터 패널용). 고치면 Enter·포커스 빠질 때 한 번만 넘긴다(타자마다 저장하지 않는다).
 *   onCommit 이 없으면 보기 전용. multiline 이면 여러 줄(Enter 는 줄바꿈, ⌘/Ctrl+Enter 로 확정).
 *   🔴 색·치수는 토큰 클래스로만. 한글 조합 중 Enter 는 확정이 아니다.
 */
import { useEffect, useState } from 'react';

export function PropertyField({
    label,
    value,
    onCommit,
    multiline = false,
    placeholder,
}: {
    label: string;
    value: string;
    onCommit?: (next: string) => void;
    multiline?: boolean;
    placeholder?: string;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => { setDraft(value); }, [value]);
    const commit = () => { if (onCommit && draft !== value) onCommit(draft); };
    const cls = 'rounded border border-line bg-side text-text px-2 py-1 text-body w-full';
    return (
        <label className="flex flex-col gap-1 text-small text-muted">
            {label}
            {!onCommit ? (
                <span className="text-body text-text whitespace-pre-wrap break-words">{value || '—'}</span>
            ) : multiline ? (
                <textarea
                    value={draft} placeholder={placeholder} rows={3}
                    onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) commit(); }}
                    className={`${cls} resize-y`}
                />
            ) : (
                <input
                    value={draft} placeholder={placeholder}
                    onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(); }}
                    className={cls}
                />
            )}
        </label>
    );
}
