/**
 * 테마 풀 편집(W12) — 「모양」 설정 안의 소절. 현재 테마의 색 토큰을 하나하나 바꾸고,
 * 이름 붙여 「내 테마」로 저장하고, JSON 으로 주고받는다. (쥔님 갈림 7: *"테마 편집은 풀 편집 가능"*)
 *
 * 🔴 features/ 라 하드코딩 색 검사가 돈다 — 토큰 클래스로만 짠다. 실제 색을 다루는 글자(hex·rgb 변환)는
 *    전부 pane-ui-system/theme 의 헬퍼(검사 밖)에서 받아 쓴다.
 * 🔴 ⛔ 토큰 이름을 코드에 나열하지 않는다 — COLOR_TOKENS 를 돌며 그린다(판 A 가 색 토큰을 더해도 저절로 뜬다).
 *    친근한 이름이 없는 토큰은 id 를 그대로 보여 준다.
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { notifyReset } from '../reset-undo';
import { useRef, useState, type ReactNode } from 'react';
import {
    COLOR_TOKENS, effectiveColors, rgbToHex, hexToRgb, isTriplet,
    useUserThemes, addUserTheme, removeUserTheme, restoreUserTheme, renameUserTheme,
    exportThemeJSON, importThemeJSON, FOCUS_RING, Button, TextInput, InlineRename,
    type ColorToken, type ThemeControls, type UserTheme,
} from '../../../pane-ui-system';

/** 친근한 이름(없는 토큰은 id 그대로) — 판 A 가 더하는 토큰도 id 로 저절로 뜬다 */
const LABELS: Partial<Record<ColorToken, string>> = {
    bg: '배경', panel: '패널', panel2: '패널 2', line: '선', text: '글자', muted: '흐린 글자',
    accent: '강조', accenth: '강조 hover', ok: '성공', bad: '위험', warn: '주의',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 pt-4 border-t border-line">
            <div className="text-body font-semibold text-text">{title}</div>
            {children}
        </div>
    );
}

export function ThemeEditor({ theme, host }: { theme: ThemeControls; host: PluginHost }) {
    const { settings, setSettings } = theme;
    const userThemes = useUserThemes();
    const fileRef = useRef<HTMLInputElement>(null);
    const [newName, setNewName] = useState('');
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const colors = effectiveColors(settings);          // 지금 쓰이는 실제 색 한 벌
    const custom = settings.custom ?? {};

    const setToken = (t: ColorToken, triplet: string) =>
        setSettings({ custom: { ...custom, [t]: triplet } });
    const revertToken = (t: ColorToken) => {
        const next = { ...custom };
        delete next[t];
        setSettings({ custom: next });
    };
    const revertAll = () => {
        const prev = settings.custom;
        setSettings({ custom: undefined });
        notifyReset(host, '바꾼 색을 전부 되돌렸습니다', () => setSettings({ custom: prev }));
    };

    const deleteUserTheme = (t: UserTheme) => {
        const at = userThemes.findIndex((x) => x.id === t.id);
        removeUserTheme(t.id);
        notifyReset(host, `테마 「${t.name}」을 지웠습니다`, () => restoreUserTheme(t, at));
    };

    const saveAsUserTheme = () => {
        const name = newName.trim();
        if (!name) return;
        addUserTheme({ name, base: settings.theme, colors: custom });
        setNewName('');
        setNote(`「${name}」 저장됨`);
    };
    const applyUserTheme = (t: UserTheme) => setSettings({ theme: t.base, custom: t.colors });

    const doExport = (t: UserTheme) => {
        const blob = new Blob([exportThemeJSON(t)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${t.name}.theme.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const doImport = async (file: File) => {
        const text = await file.text();
        const res = importThemeJSON(text);
        if (!res.theme) { setNote(res.error ?? '가져오지 못했습니다'); return; }
        addUserTheme({ name: res.theme.name, base: res.theme.base, colors: res.theme.colors });
        setNote(res.skipped > 0 ? `「${res.theme.name}」 가져옴 — ${res.skipped}개 건너뜀` : `「${res.theme.name}」 가져옴`);
    };


    return (
        <div className="flex flex-col gap-4">
            <Section title="테마 편집">
                <p className="text-small text-muted">
                    색을 바꾸면 곧바로 적용됩니다. 바꾼 색은 지금 테마 위에 덮입니다 — 「전부 되돌리기」로 원래 테마 색으로 돌아갑니다.
                </p>
                <div className="flex flex-col gap-1.5">
                    {COLOR_TOKENS.map((t) => {
                        const val = colors[t];
                        const overridden = custom[t] != null;
                        return (
                            <div key={t} className="flex items-center gap-2">
                                <input
                                    type="color"
                                    aria-label={`${LABELS[t] ?? t} 색`}
                                    value={rgbToHex(val)}
                                    onChange={(e) => { const v = hexToRgb(e.target.value); if (v) setToken(t, v); }}
                                    className="w-8 h-8 shrink-0 rounded border border-line bg-bg p-0.5 cursor-pointer"
                                />
                                <span className="w-24 shrink-0 text-small text-text truncate">{LABELS[t] ?? t}</span>
                                <input
                                    type="text"
                                    aria-label={`${LABELS[t] ?? t} r g b`}
                                    defaultValue={val}
                                    key={val}
                                    onChange={(e) => { if (isTriplet(e.target.value)) setToken(t, e.target.value.trim()); }}
                                    className={`w-28 h-7 px-2 rounded border border-line bg-bg text-text text-small
                                        ${FOCUS_RING}`}
                                />
                                <span className="text-note text-muted w-16 shrink-0 truncate">{t}</span>
                                <button
                                    type="button"
                                    onClick={() => revertToken(t)}
                                    disabled={!overridden}
                                    className={`ml-auto h-7 px-2 rounded border border-line text-small text-muted
                                        enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30
                                        ${FOCUS_RING}`}
                                >
                                    되돌리기
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div>
                    <Button onClick={revertAll}>전부 되돌리기</Button>
                </div>
            </Section>

            <Section title="내 테마">
                <div className="flex items-center gap-2">
                    <TextInput
                        type="text"
                        value={newName}
                        placeholder="이름을 붙여 지금 색을 저장"
                        onChange={(e) => setNewName(e.target.value)}
                        onEnter={() => saveAsUserTheme()}
                        className="flex-1 min-w-0"
                    />
                    <Button onClick={saveAsUserTheme} disabled={!newName.trim()} className="disabled:opacity-30">저장</Button>
                </div>

                {userThemes.length > 0 && (
                    <div className="flex flex-col rounded border border-line overflow-hidden">
                        {userThemes.map((t) => (
                            <div key={t.id} className="flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0">
                                {renaming?.id === t.id ? (
                                    <InlineRename
                                        value={renaming.name}
                                        ariaLabel="테마 이름"
                                        className="flex-1 min-w-0"
                                        onCommit={(next) => { renameUserTheme(t.id, next); setRenaming(null); }}
                                        onCancel={() => setRenaming(null)}
                                    />
                                ) : (
                                    <button type="button" onClick={() => applyUserTheme(t)}
                                        className="flex-1 min-w-0 text-left text-body text-text truncate hover:text-accent">
                                        {t.name}
                                    </button>
                                )}
                                <Button onClick={() => setRenaming({ id: t.id, name: t.name })}>이름</Button>
                                <Button onClick={() => doExport(t)}>내보내기</Button>
                                <button type="button" onClick={() => deleteUserTheme(t)}
                                    className={`h-7 px-2 rounded border border-line text-small text-bad hover:bg-bad/10
                                        ${FOCUS_RING}`}>
                                    지우기
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Button onClick={() => fileRef.current?.click()}>JSON 가져오기</Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }}
                    />
                    {note && <span className="text-small text-muted">{note}</span>}
                </div>
            </Section>
        </div>
    );
}
