/**
 * Toggle — 켜짐/꺼짐 스위치(궤도 + 손잡이). 쥔님 2026-11-01 13:42: *"켜짐이랑 꺼짐이랑 항상 쓰던 토글 UI 로"*
 * 🔴 설정 판 전부가 이 하나를 쓴다(창틀·플러그인·…). 📌 17:39 플러그인(settings/panes)에서 창틀 기본 부품(primitives)으로 올렸다 — 다른 플러그인(달력)도 써야 하는데 플러그인끼리 import 는 금지(검사 ⑨)라서. 글자 단추(켜짐/꺼짐)는 ⛔ — 스위치 하나로 통일.
 * 값 부품 규칙: `checked` + `onChange(값)`. size md 40×24 · sm 32×18.
 * ⚠️ 옛 별칭(deprecated, U-잠금b 에서 제거): on → checked · onToggle → onChange.
 * 🔴 토큰 색만. disabled 면 흐리고 안 눌린다.
 */
import { FOCUS_RING } from './focus';

export function Toggle({ checked, onChange, on, onToggle, disabled = false, label, size = 'md' }: {
    checked?: boolean;
    onChange?: (v: boolean) => void;
    /** @deprecated checked */
    on?: boolean;
    /** @deprecated onChange */
    onToggle?: (v: boolean) => void;
    disabled?: boolean;
    /** 스크린리더용 이름 */
    label?: string;
    size?: 'sm' | 'md';
}) {
    const isOn = checked ?? on ?? false;
    const fire = onChange ?? onToggle;
    const sm = size === 'sm';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-label={label}
            disabled={disabled}
            onClick={() => fire?.(!isOn)}
            className={`relative shrink-0 ${sm ? 'w-8 h-[1.125rem]' : 'w-10 h-6'} rounded-full transition-colors duration-fast active:brightness-90
                ${FOCUS_RING}
                disabled:opacity-40 disabled:cursor-not-allowed
                ${isOn ? 'bg-accent' : 'bg-text/[0.18]'}`}
        >
            <span
                className={`absolute top-0.5 left-0.5 ${sm ? 'w-3.5 h-3.5' : 'w-5 h-5'} rounded-full bg-bg shadow transition-transform duration-fast
                    ${isOn ? (sm ? 'translate-x-3.5' : 'translate-x-4') : ''}`}
            />
        </button>
    );
}
