/**
 * Field — 이름표 + 칸 + 도움말·오류 한 벌. 칸(TextInput·Textarea·NumberInput·Select …)은 안에 두기만 하면
 *   id·aria-describedby·invalid 를 context 로 받는다. layout stack = 이름표 위 · row = 이름표 왼쪽.
 */
import { createContext, useContext, useId, type ReactNode } from 'react';

type FieldCtx = { id: string; describedBy?: string; invalid: boolean };
const Ctx = createContext<FieldCtx | null>(null);

/** 입력 부품이 Field 안에서 받을 id·aria·invalid(밖이면 null) */
export function useFieldCtx() { return useContext(Ctx); }

export function Field({ label, hint, error, required = false, layout = 'stack', children, className = '' }: {
    label: string;
    hint?: ReactNode;
    /** 있으면 칸이 invalid 모양이 되고 오류 글이 보인다 */
    error?: ReactNode;
    required?: boolean;
    layout?: 'stack' | 'row';
    children: ReactNode;
    className?: string;
}) {
    const id = useId();
    const noteId = error || hint ? `${id}-note` : undefined;
    const row = layout === 'row';
    const note = error
        ? <span id={noteId} role="alert" className="text-note text-bad">{error}</span>
        : hint ? <span id={noteId} className="text-note text-muted">{hint}</span> : null;
    return (
        <Ctx.Provider value={{ id, describedBy: noteId, invalid: !!error }}>
            <div className={`flex ${row ? 'flex-row items-center justify-between gap-3' : 'flex-col gap-1'} ${className}`}>
                <label htmlFor={id} className={`text-small text-muted ${row ? 'shrink-0' : ''}`}>
                    {label}{required && <span className="text-bad" aria-hidden="true"> *</span>}
                </label>
                <div className={`flex flex-col gap-1 ${row ? 'min-w-0 flex-1 items-end' : ''}`}>
                    {children}
                    {note}
                </div>
            </div>
        </Ctx.Provider>
    );
}
