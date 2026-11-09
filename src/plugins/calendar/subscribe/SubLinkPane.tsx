/**
 * 구독 노드의 속성 칸 — 링크를 여기서 넣고 바꾼다(쥔님 2026-11-09: 노드 이름 자리에 링크를 치게 하던 것 대신 속성 패널에서).
 *   🔴 속성 패널은 칸 자리만 준다 — 이 칸은 달력(구독 주인)이 낸다(contributes.properties · target = SUB_TYPE).
 *   커밋(Enter·포커스 빠짐)은 applyLink(kind:'link') 하나로 — 저장·받기·달력 다시 그리기는 기존 길 그대로.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import { getSubById, getSubsSnapshot, subscribeSubs } from './subscriptions';
import { applyLink } from './nodes';

export function SubLinkPane({ target }: PropertiesPaneProps) {
    useSyncExternalStore(subscribeSubs, getSubsSnapshot);   // 받기 결과(lastError·lastFetched)가 오면 다시 그린다
    const sub = getSubById(target.id);
    const url = sub?.data.url ?? '';
    const [draft, setDraft] = useState(url);
    useEffect(() => { setDraft(url); }, [target.id, url]);
    if (!sub) return null;

    const commit = () => { if (draft.trim() !== url) applyLink(target.id, 'link', draft); };
    return (
        <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
                링크(.ics)
                <input
                    type="url" value={draft} placeholder="https:// 또는 webcal://"
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    // 한글 조합 중 Enter 는 커밋 아님
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit(); }}
                    className="rounded border border-line bg-side text-text px-2 py-1 text-[13px]"
                />
            </label>
            {sub.data.lastError && <p className="text-[12px] text-bad">{sub.data.lastError}</p>}
        </div>
    );
}
