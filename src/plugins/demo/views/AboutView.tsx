/**
 * 데모 「정보」 — 매니페스트(신분증)를 보여 준다.
 *   ⭐ 같은 카드를 둘이 쓴다: ① 설정 「데모」 섹션의 판(host.settings 증명) ② 「이 탭 정보」 피크(host.menu+피크 증명).
 *   ⛔ 창틀은 이 폴더를 모른다 — ViewProps 만 바깥에서 받는다.
 */
import type { ViewProps, PluginManifest } from '../../../pane-ui-system/plugin';
import { manifest } from '../manifest';

export function ManifestCard({ manifest: m }: { manifest: PluginManifest }) {
    return (
        <div className="flex flex-col gap-3 max-w-[520px]" data-testid="manifest-card">
            <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold text-text">{m.name}</span>
                <span className="text-[12px] text-muted">v{m.version}</span>
                {m.core && <span className="text-[11px] px-1.5 rounded bg-accent/15 text-accent">코어</span>}
            </div>
            {m.description && <p className="text-[13px] text-muted leading-relaxed">{m.description}</p>}
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-[12px]">
                <dt className="text-muted">id</dt><dd className="text-text font-mono">{m.id}</dd>
                <dt className="text-muted">최소 창틀</dt><dd className="text-text font-mono">{m.minHostVersion}</dd>
            </dl>
        </div>
    );
}

export function AboutView({ leaf: lf }: ViewProps) {
    const forViewId = (lf.params as { aboutViewId?: string } | undefined)?.aboutViewId;
    return (
        <div className="h-full overflow-auto px-6 py-5">
            <ManifestCard manifest={manifest} />
            {forViewId && (
                <p className="mt-4 text-[12px] text-muted">이 탭의 뷰: <span className="font-mono text-text">{forViewId}</span></p>
            )}
        </div>
    );
}
