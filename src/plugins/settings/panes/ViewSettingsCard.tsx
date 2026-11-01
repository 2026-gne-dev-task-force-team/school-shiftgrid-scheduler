/**
 * 뷰 한 장의 설정 카드 — 🔴 **플러그인 상세 안에서** 그 플러그인이 등록한 뷰마다 펼쳐진다
 *   (쥔님 2026-11-01 19:06 *"등록된 뷰 각 플러그인에 그 무슨 뷰 등록되어 있는지 거기에 설정에 들어가야 할 거 같고"*
 *    — 전 플러그인의 뷰를 한 판에 늘어놓던 「등록된 뷰」 판은 이것으로 흡수·폐기).
 *   ⭐ 내용은 그대로: ① 뷰가 가진 속성 전부 ② 줄마다 한 줄 설명 ③ 기본값 표시 + 되돌리기(쥔님 13:42 *"건들기 무서워 보임"*).
 *   - 바꿀 수 있는 것(레이아웃 힌트): 최소 폭·좁아질 때·접힘 폭 — 비우면 등록값(기본)을 따른다. 이 기기에만 남는다.
 *   - 읽기 전용(자리 제한, placement): 놓일 수 있는 틀·가르기·한 장만 — 플러그인이 등록 때 정한 값.
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import type { ReactNode } from 'react';
import {
    usePaneSettings, setViewOverride, getViewOverride,
    type Squeeze, type ViewLayout, type ViewDef,
} from '../../../pane-ui-system';

const SQUEEZES: { id: Squeeze; name: string; hint: string }[] = [
    { id: 'shrink', name: '찌그러뜨림', hint: '좁아지면 내용을 그대로 눌러 담는다' },
    { id: 'scroll', name: '스크롤', hint: '좁아지면 넘치는 만큼 스크롤한다(표·긴 목록)' },
    { id: 'collapse', name: '접힘', hint: '접힘 폭 아래면 접힌 그림으로 바뀐다' },
];

function Cell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-text">{label}</span>
            {children}
            {hint && <span className="text-[11px] text-muted leading-snug">{hint}</span>}
        </label>
    );
}

/** 숫자 칸 — 비우면 undefined(= 등록값 따름). placeholder 로 등록 기본을 보여 준다 */
function NumCell({ label, hint, value, placeholder, onChange }: {
    label: string; hint?: string; value: number | undefined; placeholder?: number; onChange: (n: number | undefined) => void;
}) {
    return (
        <Cell label={label} hint={hint}>
            <input
                type="number"
                value={value ?? ''}
                placeholder={placeholder != null ? `기본 ${placeholder}` : '없음'}
                onChange={(e) => {
                    const t = e.target.value.trim();
                    if (t === '') { onChange(undefined); return; }
                    const n = Number(t);
                    if (Number.isFinite(n)) onChange(n);
                }}
                className="w-28 h-btn px-2 rounded border border-line bg-bg text-text text-[13px] text-right
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
        </Cell>
    );
}

/** 읽기 전용 자리 제한 한 칸 — 라벨 + 값 + 한 줄 설명 */
function FactRow({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="w-24 shrink-0 text-[11px] text-muted">{label}</span>
            <span className="text-[12px] text-text">{value}</span>
            <span className="text-[11px] text-muted/80">— {hint}</span>
        </div>
    );
}

/** 안내 한 줄 — 「이 기기에만 · 비우면 기본」. 뷰 목록 머리에 한 번 */
export function ViewSettingsNote() {
    return (
        <p className="text-[11px] text-muted leading-snug">
            여기서 바꾼 것은 <span className="text-text">이 기기에만</span> 남습니다. 비우면 등록값(기본)을 따릅니다.
            「놓일 수 있는 틀·가르기·한 장만」은 플러그인이 정한 값이라 읽기 전용입니다.
        </p>
    );
}

export function ViewSettingsCard({ view: v }: { view: ViewDef }) {
    usePaneSettings();   // 덮어쓰기가 바뀌면 다시 그린다
    const base: ViewLayout = v.layout ?? {};
    const over = getViewOverride(v.id) ?? {};
    const patch = (p: Partial<ViewLayout>) => setViewOverride(v.id, p);
    const hasOver = Object.keys(over).length > 0;
    const pl = v.placement;
    const areas = pl?.areas && pl.areas.length ? pl.areas.join(' · ') : '어디든 (왼쪽·가운데·오른쪽)';
    const canSplitStr = pl?.singleton ? '안 됨 (한 장만이라 복제 불가)' : pl?.split === false ? '안 됨' : '됨';
    const singletonStr = pl?.singleton ? '예 — 딱 한 장만 뜬다(이미 있으면 그리로)' : '아니오 — 여러 장 열 수 있다';
    return (
        <div className="flex flex-col gap-3 px-2.5 py-2.5 bg-panel2">
            {hasOver && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => setViewOverride(v.id, null)}
                        className="shrink-0 whitespace-nowrap h-btn px-2 rounded border border-line text-[12px] text-muted
                            hover:text-text hover:bg-text/[0.04] transition-colors
                            focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        등록값으로
                    </button>
                </div>
            )}

            {/* 바꿀 수 있는 것 — 레이아웃 힌트(덮어쓰기) */}
            <div className="flex flex-wrap items-start gap-4">
                <NumCell
                    label="최소 폭(px)"
                    hint="이 폭 아래로는 못 줄인다"
                    value={over.minWidth}
                    placeholder={base.minWidth}
                    onChange={(n) => patch({ minWidth: n })}
                />
                <Cell label="좁아질 때" hint={SQUEEZES.find((s) => s.id === (over.squeeze ?? base.squeeze))?.hint}>
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
                    hint="「접힘」일 때 이 폭 아래면 접힌 그림으로"
                    value={over.collapseBelow}
                    placeholder={base.collapseBelow}
                    onChange={(n) => patch({ collapseBelow: n })}
                />
            </div>

            {/* 읽기 전용 — 자리 제한(placement). 플러그인이 등록 때 정한 값 */}
            <div className="flex flex-col gap-1 pt-2 border-t border-line">
                <FactRow label="놓일 수 있는 틀" value={areas} hint="이 뷰를 둘 수 있는 자리" />
                <FactRow label="가르기" value={canSplitStr} hint="옆·아래로 복제해 나눌 수 있나" />
                <FactRow label="한 장만" value={singletonStr} hint="딱 한 장만 뜨는 뷰인가" />
            </div>
        </div>
    );
}
