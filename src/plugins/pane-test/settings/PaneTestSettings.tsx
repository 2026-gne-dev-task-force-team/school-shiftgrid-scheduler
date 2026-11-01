/**
 * 「팬 UI 엔진 테스트」 설정 Pane — 설정 섹션 기여점을 자기 몸으로 증명한다(쥔님: 설정 섹션도 써 본다).
 *   🔴 피크 넓음/좁음 가름 폭(설정으로 뺀 값) — 이 칸 폭이 이 값 이상이면 오른쪽, 아래면 바닥.
 *   값은 host.storage(기기별)에 산다 · 시험 탭의 「피크 열기」가 읽어 쓴다.
 */
import { useState } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { PEEK_WIDE_MIN_KEY, PEEK_WIDE_MIN_DEFAULT } from '../store';

export function PaneTestSettings({ host }: { host: PluginHost }) {
    const [wideMin, setWideMin] = useState(() => host.storage.get(PEEK_WIDE_MIN_KEY, PEEK_WIDE_MIN_DEFAULT));

    const commit = (n: number) => {
        const v = Number.isFinite(n) ? Math.max(120, Math.min(1200, Math.round(n))) : PEEK_WIDE_MIN_DEFAULT;
        setWideMin(v);
        host.storage.set(PEEK_WIDE_MIN_KEY, v);
    };

    return (
        <div className="flex flex-col gap-4 max-w-[560px] text-[13px] text-text">
            <p className="text-muted">
                이 플러그인은 창틀(pane-ui-system)을 눈으로 시험하는 하네스입니다. 리본의 ✨ 아이콘으로 시험 탭을 엽니다.
            </p>

            <div className="flex flex-col gap-1.5">
                <label htmlFor="peek-wide-min" className="font-semibold">피크 넓음/좁음 가름 폭</label>
                <p className="text-muted">시험 탭 칸의 폭이 이 값(px) 이상이면 피크가 <span className="text-text">오른쪽</span>에서, 아래면 <span className="text-text">바닥</span>에서 뜹니다. 🔴 창 폭이 아니라 그 칸의 폭입니다.</p>
                <div className="flex items-center gap-2">
                    <input
                        id="peek-wide-min"
                        type="number"
                        min={120}
                        max={1200}
                        step={10}
                        value={wideMin}
                        onChange={(e) => commit(Number(e.target.value))}
                        className="w-28 px-2 py-1 rounded border border-line bg-panel2 text-text"
                    />
                    <span className="text-muted">px</span>
                </div>
            </div>
        </div>
    );
}
