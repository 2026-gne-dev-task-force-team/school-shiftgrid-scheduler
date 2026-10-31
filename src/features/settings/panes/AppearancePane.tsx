/**
 * 「모양」 설정 Pane — 테마 레이어를 눈으로 고르는 자리. 고르는 즉시 화면이 바뀐다.
 *
 * 🔴 features/ 라 하드코딩 색 검사가 돈다 — 토큰 클래스(bg-panel2·border-accent …)로만 짠다.
 *    강조색 동그라미의 실제 색만 theme 의 accentSwatchStyle() 헬퍼로 받는다(검사 밖에 있다).
 * ⛔ 테마 JSON 가져오기/내보내기는 이번에 안 만든다 — 단추도 두지 않는다(아래 자리 표시만).
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../../ui-system';
import type { SettingsPaneProps } from '../registry';
import { ACCENTS, type DensityId } from '../../../ui-system';
import { resolveMode, accentSwatchStyle } from '../../../ui-system';
import type { ThemeMode } from '../../../ui-system';

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <div>
                <div className="text-[13px] font-semibold text-text">{title}</div>
                {hint && <div className="text-[12px] text-muted">{hint}</div>}
            </div>
            {children}
        </div>
    );
}

function Choice({
    active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon?: IconName; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-1.5 h-btn px-3 rounded border text-[13px] transition-colors
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                ${active
                    ? 'border-accent text-text bg-text/[0.06]'
                    : 'border-line text-muted hover:text-text hover:bg-text/[0.04]'}`}
        >
            {icon && <Icon name={icon} size={14} />}
            {children}
        </button>
    );
}

const MODES: { id: ThemeMode; name: string; icon?: IconName }[] = [
    { id: 'light', name: '밝게', icon: 'sun' },
    { id: 'dark', name: '어둡게', icon: 'moon' },
    { id: 'system', name: '시스템' },
];

const DENSITIES: { id: DensityId; name: string }[] = [
    { id: 'compact', name: '빽빽' },
    { id: 'cozy', name: '편안' },
];

export function AppearancePane({ theme }: SettingsPaneProps) {
    const { settings, setSettings, reset } = theme;
    const resolved = resolveMode(settings.mode);

    return (
        <div className="flex flex-col gap-6 max-w-[520px]">
            <Field title="테마" hint="시스템은 기기의 밝기 설정을 따라갑니다.">
                <div className="flex flex-wrap gap-2">
                    {MODES.map((m) => (
                        <Choice
                            key={m.id}
                            active={settings.mode === m.id}
                            icon={m.icon}
                            onClick={() => setSettings({ mode: m.id })}
                        >
                            {m.name}
                        </Choice>
                    ))}
                </div>
            </Field>

            <Field title="밀도" hint="빽빽하면 줄·단추가 작아집니다. 손가락 기기는 바닥 아래로 내려가지 않습니다.">
                <div className="flex flex-wrap gap-2">
                    {DENSITIES.map((d) => (
                        <Choice
                            key={d.id}
                            active={settings.density === d.id}
                            onClick={() => setSettings({ density: d.id })}
                        >
                            {d.name}
                        </Choice>
                    ))}
                </div>
            </Field>

            <Field title="강조색" hint="선택·포커스에 쓰이는 포인트 색입니다.">
                <div className="flex flex-wrap gap-2">
                    {ACCENTS.map((a) => {
                        const active = settings.accent === a.id;
                        return (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => setSettings({ accent: a.id })}
                                aria-pressed={active}
                                title={a.name}
                                className={`grid place-items-center w-7 h-7 rounded-full border-2 transition-colors
                                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                                    ${active ? 'border-text' : 'border-line hover:border-muted'}`}
                            >
                                <span
                                    className="block w-4 h-4 rounded-full"
                                    style={accentSwatchStyle(a.id, resolved)}
                                />
                            </button>
                        );
                    })}
                </div>
            </Field>

            <div className="pt-2 border-t border-line">
                <button
                    type="button"
                    onClick={reset}
                    className="h-btn px-3 rounded border border-line text-[13px] text-muted
                        hover:text-text hover:bg-text/[0.04] transition-colors
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                    기본값으로 되돌리기
                </button>
            </div>

            {/* ⬜ 나중 자리: 테마 JSON 가져오기 / 내보내기 — ⛔ 이번엔 단추도 만들지 않는다 */}
        </div>
    );
}
