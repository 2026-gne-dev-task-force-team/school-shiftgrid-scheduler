/**
 * 설정 「스케줄러」 섹션 판 — 눈금 기본값(시작 시각·수업분·쉬는분·열 수).
 *
 * 🔴 값을 바꾸면 ① 기기별 기본값에 저장(새 스케줄이 이 값으로 생긴다) ② 지금 스케줄에 바로 적용(축이 바뀐다).
 *    ⚠️ 적용은 줄·열을 규칙대로 다시 세운다 — 카드는 분 위치로 살리되 손본 줄 라벨·없어진 열의 카드는 떨어진다.
 */
import { useState } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { ScheduleStore } from '../store';
import { gridDefaultsOf, saveGridDefaults } from '../store';
import type { GridDefaults } from '../model';

export function SchedulerSettingsPane({ host, store }: { host: PluginHost; store: ScheduleStore }) {
    const [g, setG] = useState<GridDefaults>(() => gridDefaultsOf(host));

    const apply = (next: GridDefaults) => {
        setG(next);
        saveGridDefaults(host, next);
        store.applyGrid(next);   // 🔴 지금 스케줄에 바로 적용 — 축이 바뀐다
    };

    const field = 'w-28 bg-panel2 border border-line rounded px-2 py-1 text-[13px] text-text outline-none focus:border-accent';
    const row = 'flex items-center justify-between gap-3 py-1.5';
    const label = 'text-[13px] text-text';
    const num = (v: number, k: keyof GridDefaults) => (
        <input type="number" className={field} value={v} data-testid={`grid-${String(k)}`}
            onChange={(e) => apply({ ...g, [k]: Math.max(1, Number(e.target.value) || 0) })} />
    );

    return (
        <div className="max-w-md" data-testid="scheduler-settings">
            <p className="text-[12px] text-muted mb-2">새 스케줄의 눈금 기본값. 바꾸면 지금 스케줄에도 바로 적용된다.</p>
            <div className={row}>
                <span className={label}>시작 시각</span>
                <input type="time" className={field} value={g.startTime} data-testid="grid-startTime"
                    onChange={(e) => apply({ ...g, startTime: e.target.value || '09:00' })} />
            </div>
            <div className={row}><span className={label}>수업 길이(분)</span>{num(g.classMinutes, 'classMinutes')}</div>
            <div className={row}><span className={label}>쉬는 시간(분)</span>{num(g.breakMinutes, 'breakMinutes')}</div>
            <div className={row}><span className={label}>줄 수</span>{num(g.rowCount, 'rowCount')}</div>
            <div className={row}><span className={label}>열 수(요일)</span>{num(g.colCount, 'colCount')}</div>
        </div>
    );
}
