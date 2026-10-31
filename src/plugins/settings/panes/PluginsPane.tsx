/**
 * 「플러그인」 설정 Pane — 설치된 플러그인 목록 · 이름·버전·코어 표시 · 켜기/끄기 토글.
 *   ⭐ 데모를 끄면 리본·사이드바 탭이 자리표시로 바뀌는 걸 눈으로 본다(그 자리에서 되돌아온다).
 *   🔴 ⛔ 코어(settings 등)는 토글이 잠긴다 — 「설정을 꺼서 설정을 못 켜는」 일이 없다.
 */
import { Icon } from '../../../pane-ui-system';
import { listPlugins, enablePlugin, disablePlugin, usePluginRegistry } from '../../../pane-ui-system/plugin';

export function PluginsPane() {
    usePluginRegistry();   // 켜고 끄면 다시 그린다
    const plugins = listPlugins();

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted">
                설치된 플러그인입니다. 끄면 그 플러그인이 꽂은 뷰·리본·설정·상태바가 빠지고, 열려 있던 탭은
                「켜기」 자리표시로 남습니다(다시 켜면 그 자리에서 돌아옵니다). 저장은 이 기기에만 남습니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {plugins.map((p) => (
                    <div
                        key={p.id}
                        className="flex items-center gap-3 px-3 h-row border-b border-line last:border-b-0"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-text truncate">{p.name}</span>
                                <span className="text-[11px] text-muted">v{p.version}</span>
                                {p.core && <span className="text-[11px] px-1.5 rounded bg-accent/15 text-accent">코어</span>}
                                {p.failed && (
                                    <span className="flex items-center gap-1 text-[11px] text-warn">
                                        <Icon name="warn" size={12} /> 활성 실패
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-muted font-mono">{p.id}</span>
                        </div>

                        <button
                            type="button"
                            aria-pressed={p.enabled}
                            disabled={p.core}
                            title={p.core ? '코어 플러그인은 끌 수 없습니다' : (p.enabled ? '끄기' : '켜기')}
                            onClick={() => (p.enabled ? disablePlugin(p.id) : enablePlugin(p.id))}
                            className={`h-7 px-3 rounded border text-[12px] transition-colors shrink-0
                                focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                                disabled:opacity-40 disabled:cursor-not-allowed
                                ${p.enabled
                                    ? 'border-accent text-text bg-text/[0.06]'
                                    : 'border-line text-muted enabled:hover:text-text enabled:hover:bg-text/[0.04]'}`}
                        >
                            {p.enabled ? '켜짐' : '꺼짐'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
