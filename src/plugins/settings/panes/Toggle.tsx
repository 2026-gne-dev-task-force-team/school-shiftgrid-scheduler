/**
 * Toggle — 켜짐/꺼짐 스위치(궤도 + 손잡이). 쥔님 2026-11-01 13:42: *"켜짐이랑 꺼짐이랑 항상 쓰던 토글 UI 로"*
 * 🔴 설정 판 전부가 이 하나를 쓴다(창틀·플러그인·…). 글자 단추(켜짐/꺼짐)는 ⛔ — 스위치 하나로 통일.
 * 🔴 토큰 색만. disabled 면 흐리고 안 눌린다.
 */
export function Toggle({ on, onToggle, disabled = false, label }: {
    on: boolean;
    onToggle: (v: boolean) => void;
    disabled?: boolean;
    label?: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            disabled={disabled}
            onClick={() => onToggle(!on)}
            className={`relative shrink-0 w-10 h-6 rounded-full transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                disabled:opacity-40 disabled:cursor-not-allowed
                ${on ? 'bg-accent' : 'bg-text/[0.18]'}`}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-bg shadow transition-transform
                    ${on ? 'translate-x-4' : ''}`}
            />
        </button>
    );
}
