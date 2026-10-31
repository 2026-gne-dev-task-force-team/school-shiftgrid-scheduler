/**
 * 「창틀」 설정 Pane — 패널·탭·좁은 화면의 치수. 바로 코드에 박지 않고 여기서 바꾼다(쥔님 2026-11-01).
 *   🔴 사이드바 최소 폭이 여기서 오고, clamp 가 「이 값 ⊔ 뷰 힌트」로 가둔다 — 무한정 안 줄어든다.
 *
 * 🔴 features/ 라 하드코딩 색 검사가 돈다 — 토큰 클래스(border-line·text-text·bg-bg …)로만.
 * ⚠️ 지금 라이브로 먹는 것은 사이드바 폭·최소·최대다. 탭 폭·좁은 화면 기준·자동 닫기는
 *    값만 저장해 두고(창구) 다음 단계에서 각 자리에 물린다 — 창구를 먼저 빼 두라는 지시(쥔님)대로.
 */
import type { ReactNode } from 'react';
import { usePaneSettings, setPaneSettings, resetPaneSettings } from '../../../pane-ui-system';
import type { PaneSettings } from '../../../pane-ui-system';

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
                <div className="text-[13px] font-semibold text-text">{title}</div>
                {hint && <div className="text-[12px] text-muted">{hint}</div>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    return (
        <input
            type="number"
            value={value}
            onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
            className="w-24 h-btn px-2 rounded border border-line bg-bg text-text text-[13px] text-right
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
    );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(!on)}
            className={`h-btn px-3 rounded border text-[13px] transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                ${on ? 'border-accent text-text bg-text/[0.06]' : 'border-line text-muted hover:text-text hover:bg-text/[0.04]'}`}
        >
            {on ? '켜짐' : '꺼짐'}
        </button>
    );
}

export function PaneSettingsPane() {
    const { settings } = usePaneSettings();
    const set = (patch: Partial<PaneSettings>) => setPaneSettings(patch);

    return (
        <div className="flex flex-col gap-5 max-w-[560px]">
            <div className="flex flex-col gap-4">
                <Field title="사이드바 기본 폭" hint="새로 열 때의 폭(px)">
                    <NumberInput value={settings.sidebarWidth} onChange={(n) => set({ sidebarWidth: n })} />
                </Field>
                <Field title="사이드바 최소 폭" hint="이 아래로는 못 줄인다 · 뷰가 더 큰 최소를 요구하면 그쪽이 이긴다">
                    <NumberInput value={settings.sidebarMinWidth} onChange={(n) => set({ sidebarMinWidth: n })} />
                </Field>
                <Field title="사이드바 최대 폭" hint="이 위로는 못 늘린다(px)">
                    <NumberInput value={settings.sidebarMaxWidth} onChange={(n) => set({ sidebarMaxWidth: n })} />
                </Field>
            </div>

            <div className="flex flex-col gap-4 pt-4 border-t border-line">
                <Field title="탭 한 칸 최소/최대 폭" hint="좁으면 글자가 잘리고, 넘치면 탭 줄이 스크롤된다(px)">
                    <div className="flex items-center gap-2">
                        <NumberInput value={settings.tabMinWidth} onChange={(n) => set({ tabMinWidth: n })} />
                        <span className="text-muted">~</span>
                        <NumberInput value={settings.tabMaxWidth} onChange={(n) => set({ tabMaxWidth: n })} />
                    </div>
                </Field>
                <Field title="좁은 화면 기준폭" hint="이 폭 아래면 붙박이 대신 덮는 서랍으로(px)">
                    <NumberInput value={settings.narrowWidth} onChange={(n) => set({ narrowWidth: n })} />
                </Field>
                <Field title="서랍 자동 닫기" hint="고정을 푼 서랍에서 바깥을 누르면 접힌다">
                    <Toggle on={settings.autoClose} onToggle={(v) => set({ autoClose: v })} />
                </Field>
            </div>

            {/* 🔴 틀 두 줄(판 A) — 상단 타이틀바·하단 상태바 보이기. 기기별 저장 */}
            <div className="flex flex-col gap-4 pt-4 border-t border-line">
                <Field title="상단 바 보이기" hint="전체 폭 상단 타이틀바(앱 이름·액션)">
                    <Toggle on={settings.showTitleBar} onToggle={(v) => set({ showTitleBar: v })} />
                </Field>
            </div>

            <div className="pt-2 border-t border-line">
                <button
                    type="button"
                    onClick={resetPaneSettings}
                    className="h-btn px-3 rounded border border-line text-[13px] text-muted
                        hover:text-text hover:bg-text/[0.04] transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    기본값으로 되돌리기
                </button>
            </div>
        </div>
    );
}
