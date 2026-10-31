/**
 * 「뷰」 설정 Pane — 등록된 뷰마다 레이아웃 힌트(minWidth·squeeze·collapseBelow)를 여기서 덮어쓴다.
 *   ⭐ 등록값은 "기본값일 뿐" — 비워 두면 등록값을 따른다(쥔님: "등록값은 기본, 설정이 덮는다").
 *   🔴 ⛔ 창틀 코드가 뷰 id 를 알 필요가 없다 — host.views.list() 목록을 돌며 그린다.
 *
 * 🔴 app/ 이라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import type { ReactNode } from 'react';
import {
    usePaneSettings, setViewOverride, getViewOverride,
    type Squeeze, type ViewLayout,
} from '../../../pane-ui-system';
import { appHost } from '../../host';

const SQUEEZES: { id: Squeeze; name: string }[] = [
    { id: 'shrink', name: '찌그러뜨림' },
    { id: 'scroll', name: '스크롤' },
    { id: 'collapse', name: '접힘' },
];

function Cell({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">{label}</span>
            {children}
        </label>
    );
}

/** 숫자 칸 — 비우면 undefined(= 등록값 따름). placeholder 로 등록 기본을 보여 준다 */
function NumCell({ label, value, placeholder, onChange }: {
    label: string; value: number | undefined; placeholder?: number; onChange: (n: number | undefined) => void;
}) {
    return (
        <Cell label={label}>
            <input
                type="number"
                value={value ?? ''}
                placeholder={placeholder != null ? String(placeholder) : '없음'}
                onChange={(e) => {
                    const t = e.target.value.trim();
                    if (t === '') { onChange(undefined); return; }
                    const n = Number(t);
                    if (Number.isFinite(n)) onChange(n);
                }}
                className="w-24 h-btn px-2 rounded border border-line bg-bg text-text text-[13px] text-right
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
        </Cell>
    );
}

export function ViewSettingsPane() {
    usePaneSettings();   // 덮어쓰기가 바뀌면 다시 그린다
    const views = appHost.views.list();

    return (
        <div className="flex flex-col gap-3 max-w-[640px]">
            <p className="text-[12px] text-muted">
                비워 두면 등록값(기본)을 따릅니다. 「접힘」을 고르면 접힘 폭 아래에서 뷰가 접힌 그림으로 그려집니다.
            </p>
            {views.map((v) => {
                const base: ViewLayout = v.layout ?? {};
                const over = getViewOverride(v.id) ?? {};
                const patch = (p: Partial<ViewLayout>) => setViewOverride(v.id, p);
                const hasOver = Object.keys(over).length > 0;
                return (
                    <div key={v.id} className="rounded border border-line bg-panel2 p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <span className="text-[13px] font-semibold text-text">{v.title}</span>
                                <span className="ml-2 text-[11px] text-muted">{v.id}</span>
                            </div>
                            {hasOver && (
                                <button
                                    type="button"
                                    onClick={() => setViewOverride(v.id, null)}
                                    className="h-btn px-2 rounded border border-line text-[12px] text-muted
                                        hover:text-text hover:bg-text/[0.04] transition-colors
                                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    등록값으로
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-start gap-4">
                            <NumCell
                                label="최소 폭(px)"
                                value={over.minWidth}
                                placeholder={base.minWidth}
                                onChange={(n) => patch({ minWidth: n })}
                            />
                            <Cell label="좁아질 때">
                                <select
                                    value={over.squeeze ?? ''}
                                    onChange={(e) => patch({ squeeze: (e.target.value || undefined) as Squeeze | undefined })}
                                    className="h-btn px-2 rounded border border-line bg-bg text-text text-[13px]
                                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    <option value="">등록값{base.squeeze ? ` (${base.squeeze})` : ''}</option>
                                    {SQUEEZES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </Cell>
                            <NumCell
                                label="접힘 폭(px)"
                                value={over.collapseBelow}
                                placeholder={base.collapseBelow}
                                onChange={(n) => patch({ collapseBelow: n })}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
