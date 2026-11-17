/**
 * 시수표 위 「선택 열」 띠 — 공동 담당·특별실·묶음·진도 맞춤·격주·고정 열을 이 시수표에 켜고 끈다(F4).
 *   안 켜면 표엔 기본 넷 열뿐. 켜기·끄기는 optional-columns.ts(순수) — 여기는 얇은 화면.
 */
import { useSyncExternalStore } from 'react';
import { Checkbox } from '../../pane-ui-system';
import type { CollectionKit } from '../collection/contracts/collection';
import { OPTIONAL_COLUMNS, enabledOptionalKeys, setOptionalColumn } from './optional-columns';

export function OptionalColumnsBar({ kit }: { kit: CollectionKit }) {
    // 목록을 열고 닫거나 칸이 바뀌면 다시 그린다 — 켜진 열의 key 글자를 스냅샷으로 쓴다(값이 같으면 다시 안 그림).
    const snap = useSyncExternalStore(
        (fn) => { const d = kit.onChange(fn); return () => d.dispose(); },
        () => `${kit.active() ?? ''}|${enabledOptionalKeys(kit, kit.active()).join(',')}`,
    );
    const listId = kit.active();
    if (!listId) return null;
    const on = new Set(snap.split('|')[1].split(',').filter((k) => k !== ''));
    return (
        <details className="border-b border-line" style={{ padding: '6px 10px' }}>
            <summary>선택 열 ({on.size}개 켬)</summary>
            <p style={{ margin: '6px 0' }}>기본 열(교사·반·과목·시수) 밖에 필요한 열만 켜세요. 꺼도 적어 둔 값은 남아 있고, 다시 켜면 보입니다.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                {OPTIONAL_COLUMNS.map((c) => (
                    <Checkbox key={c.key} label={c.label} checked={on.has(c.key)} onChange={(v) => setOptionalColumn(kit, listId, c.key, v)} />
                ))}
            </div>
        </details>
    );
}
