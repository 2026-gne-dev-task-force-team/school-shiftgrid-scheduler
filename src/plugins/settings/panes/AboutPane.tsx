/**
 * 「이 프로그램」 Pane — 앱 이름·판·창틀 판·설치된 플러그인 수. 쥔님 2026-11-01 13:14: *"설정에서 이 프로그램에 대해서 그것도 하나"*
 * 🔴 앱 이름은 document.title 에서 읽는다 — 설정 플러그인은 어느 앱에 꽂혔는지 모른다.
 */
import { HOST_VERSION, listPlugins, usePluginRegistry } from '../../../pane-ui-system/plugin';

function appVersion(): string {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_APP_VERSION ?? '';
}

export function AboutPane() {
    usePluginRegistry();
    const plugins = listPlugins();
    const name = typeof document !== 'undefined' ? document.title : '';
    const rows: [string, string][] = [
        ['이름', name],
        ['판', appVersion() || '—'],
        ['창틀(pane-ui-system)', HOST_VERSION],
        ['플러그인', `${plugins.length}개 (코어 ${plugins.filter((p) => p.core).length})`],
    ];
    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 px-3 min-h-row py-1.5 border-b border-line last:border-b-0">
                        <span className="w-40 shrink-0 text-[12px] text-muted">{k}</span>
                        <span className="text-[13px] text-text truncate">{v}</span>
                    </div>
                ))}
            </div>
            <p className="text-[12px] text-muted">설정·배치·테마는 이 기기에만 저장됩니다. 문서는 파일로 따로 저장합니다.</p>
        </div>
    );
}
