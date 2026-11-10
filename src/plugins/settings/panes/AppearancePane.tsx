/**
 * 「모양」 설정 Pane — 테마를 눈으로 고르는 자리. 고르는 즉시 화면이 바뀐다.
 *
 * 🔴 features/ 라 하드코딩 색 검사가 돈다 — 토큰 클래스(bg-panel2·border-accent …)로만 짠다.
 *    테마 견본 네모의 실제 색만 theme 의 themeSwatchStyle() 헬퍼로 받는다(검사 밖에 있다).
 * ⭐ 2026-11-01(W12): 풀 편집·내 테마·JSON 은 ThemeEditor 소절로 뺀다(이 파일은 고르기만).
 */
import type { ReactNode } from 'react';
import { Icon, Button, FOCUS_RING, useTheme, type IconName } from '../../../pane-ui-system';
import { THEMES, DENSITIES, FONT_SIZES } from '../../../pane-ui-system';
import { themeSwatchStyle } from '../../../pane-ui-system';
import type { ThemeMode } from '../../../pane-ui-system';
import { ThemeEditor } from './ThemeEditor';
import type { SettingsPaneProps } from '../registry';
import { notifyReset } from '../reset-undo';

function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <div>
                <div className="text-body font-semibold text-text">{title}</div>
                {hint && <div className="text-small text-muted">{hint}</div>}
            </div>
            {children}
        </div>
    );
}

function Choice({
    active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon?: IconName; children: ReactNode }) {
    return (
        <Button
            variant={active ? 'accent' : 'ghost'}
            onClick={onClick}
            aria-pressed={active}
            className="flex items-center gap-1.5"
        >
            {icon && <Icon name={icon} size={14} />}
            {children}
        </Button>
    );
}

/** 테마 견본 네모 — bg·panel·accent 세 띠로 팔레트의 결을 보여 준다(실제 색은 헬퍼가 준다) */
function Swatch({ themeId }: { themeId: string }) {
    const s = themeSwatchStyle(themeId);
    return (
        <span className="flex h-9 w-14 shrink-0 overflow-hidden rounded border" style={{ borderColor: s.border }}>
            <span className="flex-1" style={s.bg} />
            <span className="flex-1" style={s.panel} />
            <span className="w-3" style={s.accent} />
        </span>
    );
}

const MODES: { id: ThemeMode; name: string; icon?: IconName }[] = [
    { id: 'light', name: '밝게', icon: 'sun' },
    { id: 'dark', name: '어둡게', icon: 'moon' },
    { id: 'system', name: '시스템' },
];

export function AppearancePane({ host }: SettingsPaneProps) {
    // 🔴 테마는 이 Pane 이 유일한 소비자다 — 여기서 쥔다(두 곳에서 useTheme 하면 상태가 둘로 갈린다).
    const theme = useTheme();
    const { settings, setSettings, reset: resetTheme } = theme;
    const reset = () => {
        const prev = settings;
        resetTheme();
        notifyReset(host, '모양을 기본값으로 되돌렸습니다', () => setSettings(prev));
    };

    return (
        <div className="flex flex-col gap-6 max-w-[560px]">
            <Field title="테마" hint="색 한 벌을 고릅니다. 밝기 짝이 있는 테마는 아래 「밝기」를 따라갑니다.">
                <div className="flex flex-wrap gap-2">
                    {THEMES.map((t) => {
                        const active = settings.theme === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setSettings(t.pairId ? { theme: t.id } : { theme: t.id, mode: t.base })}
                                aria-pressed={active}
                                title={t.name}
                                className={`flex items-center gap-2 py-1.5 pl-1.5 pr-3 rounded-md border text-body transition-colors
                                    ${FOCUS_RING}
                                    ${active
                                        ? 'border-accent text-text bg-text/[0.06]'
                                        : 'border-line text-muted hover:text-text hover:bg-text/[0.04]'}`}
                            >
                                <Swatch themeId={t.id} />
                                {t.name}
                            </button>
                        );
                    })}
                </div>
            </Field>

            <Field title="밝기" hint="시스템은 기기의 밝기 설정을 따라갑니다. 밝기 짝이 없는 테마(Nord 등)를 고르면 그 테마의 밝기로 고정되고, 밝기를 바꾸면 노션 테마로 돌아갑니다.">
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

            <Field title="밀도" hint="줄 높이·여백·단추 크기. 빽빽 · 보통 · 여유 · 넉넉 네 단계입니다. 손가락 기기는 바닥 아래로 내려가지 않습니다.">
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

            <Field title="글자 크기" hint="화면 전체 글자가 함께 커지거나 작아집니다. 밀도와 따로 고릅니다.">
                <div className="flex flex-wrap gap-2">
                    {FONT_SIZES.map((f) => (
                        <Choice
                            key={f.id}
                            active={settings.fontSize === f.id}
                            onClick={() => setSettings({ fontSize: f.id })}
                        >
                            {f.name}
                        </Choice>
                    ))}
                </div>
            </Field>

            {/* 미리보기 — 지금 고른 글자 크기·밀도로 보이는 한 줄 */}
            <div
                data-testid="density-preview"
                className="flex items-center h-row px-pad rounded-md border border-line bg-panel2 text-body text-text"
            >
                이렇게 보입니다 — 3교시 국어 · 김선생님 · 2학년 4반
            </div>

            <div className="pt-2 border-t border-line">
                {/* 🔴 단추는 안 찌그러진다 — shrink-0 + 줄바꿈 금지(쥔님 13:42 「되돌리기 버튼이 찌그러진다」) */}
                <Button variant="ghost" size="md" onClick={reset} className="shrink-0 whitespace-nowrap">
                    기본값으로 되돌리기
                </Button>
            </div>

            <ThemeEditor theme={theme} host={host} />
        </div>
    );
}
