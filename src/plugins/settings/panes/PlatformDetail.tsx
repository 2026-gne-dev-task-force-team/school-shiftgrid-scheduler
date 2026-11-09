/**
 * 「플랫폼(바닥)」 상세 — 바닥이 플러그인에게 주는 것(HOST_SERVICES 표)과 지금 켜진 약속 목록(P6a · R8).
 */
import { HOST_SERVICES, HOST_VERSION, listInterfaces, usePluginRegistry } from '../../../pane-ui-system/plugin';

export function PlatformDetail() {
    usePluginRegistry();   // 약속은 플러그인을 켜고 끄면 바뀐다
    const ifaces = listInterfaces();
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h3 className="text-lead font-semibold text-text">플랫폼(바닥) <span className="text-note text-muted font-normal">v{HOST_VERSION}</span></h3>
                <p className="text-body text-text leading-relaxed mt-1">
                    모든 플러그인이 올라서는 바닥입니다. 끌 수 없고, 아래 기능을 플러그인마다 같은 모양으로 내줍니다.
                </p>
            </div>
            <section className="flex flex-col gap-1.5">
                <h4 className="text-note font-semibold uppercase tracking-wide text-muted">바닥이 주는 기능 <span className="text-muted/70">{Object.keys(HOST_SERVICES).length}</span></h4>
                <div className="flex flex-col rounded border border-line overflow-hidden">
                    {Object.entries(HOST_SERVICES).map(([key, s]) => (
                        <div key={key} className="px-2.5 py-1.5 border-b border-line last:border-b-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-small font-medium text-text">{s.label}</span>
                                <span className="text-micro text-muted/70 font-mono">host.{key}</span>
                            </div>
                            <p className="text-small text-text/80 leading-snug">{s.desc}</p>
                            <p className="text-note text-muted">예: {s.example}</p>
                        </div>
                    ))}
                </div>
            </section>
            <section className="flex flex-col gap-1.5">
                <h4 className="text-note font-semibold uppercase tracking-wide text-muted">켜진 약속 <span className="text-muted/70">{ifaces.length}</span></h4>
                <div className="flex flex-col rounded border border-line overflow-hidden">
                    {ifaces.map((i) => (
                        <div key={i.name} className="flex items-center gap-2 px-2.5 py-1 border-b border-line last:border-b-0">
                            <span className="text-small text-text font-mono">{i.name}</span>
                            <span className="text-micro text-muted">v{i.version}</span>
                            <span className="text-micro text-muted ml-auto">{i.provider ? `채움: ${i.provider}` : '채우는 쪽 없음'}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
