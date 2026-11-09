/**
 * 권한 한 줄 — 눌러서 담기/빼기 + 이름 + 「이 권한이 있으면 무엇을 할 수 있나」 설명(쥔님 2026-11-09 「권한 자세한 설명이 없다」).
 *   역할 편집기(담은 권한)·사용자 편집기(직접 준 권한)가 같이 쓴다. 🔴 색은 토큰 클래스로만.
 */
export function PermRow({ p, has, onToggle }: {
    p: { id: string; title: string; desc?: string };
    has: boolean;
    onToggle: (id: string, has: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={has}
            title={p.id}
            onClick={() => onToggle(p.id, has)}
            className={`flex items-start gap-2 text-left px-2 py-1.5 rounded border ${has ? 'border-accent bg-accent/[0.06]' : 'border-line hover:bg-text/[0.04]'}`}
        >
            <span className={`mt-0.5 shrink-0 w-3.5 h-3.5 rounded-sm border grid place-items-center text-[10px] leading-none ${has ? 'border-accent bg-accent text-bg' : 'border-line'}`}>
                {has ? '✓' : ''}
            </span>
            <span className="min-w-0 flex flex-col">
                <span className={`text-[12px] ${has ? 'text-text' : 'text-muted'}`}>{p.title}</span>
                {p.desc && <span className="text-[11px] text-muted leading-snug">{p.desc}</span>}
            </span>
        </button>
    );
}
