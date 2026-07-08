/**
 * 블랙아웃 관리 — '언제 못 쓰는지'를 한 타입으로 모은 것을 보여준다.
 * 휴일(전부 막음)·교사 복무(그 사람만)·시설 수리(그 자원만)가 모두 같은 Blackout.
 * targets + mode 조합으로 '무엇을 막는지'가 정해진다.
 */
import { useState } from 'react';
import { useStore } from '../../store/store';
import { Overlay } from './CombinedView';
import type { Blackout, TargetRef } from '../../types/schema';

let boSeq = 0;

export default function BlackoutManager() {
    const { doc, dispatch, setUI } = useStore();
    const [name, setName] = useState('');
    const [date, setDate] = useState('2026-05-15');
    const [kind, setKind] = useState<'holiday' | 'agent' | 'resource'>('holiday');
    const [targetId, setTargetId] = useState('');

    const add = () => {
        if (!name.trim()) return;
        let targets: TargetRef[] = [];
        let mode: Blackout['mode'] = 'all-except';
        let category = '학사일정';
        if (kind === 'agent' && targetId) { targets = [{ kind: 'agent', id: targetId }]; mode = 'only'; category = '교사 복무'; }
        if (kind === 'resource' && targetId) { targets = [{ kind: 'resource', id: targetId }]; mode = 'only'; category = '시설'; }
        dispatch({
            type: 'ADD_BLACKOUT',
            blackout: { id: `bo-${boSeq++}`, name: name.trim(), startDate: date, endDate: date, targets, mode, attr: { category } },
        });
        setName('');
    };

    const describe = (b: Blackout): string => {
        if (b.mode === 'all-except' && b.targets.length === 0) return '전부 막음 (휴일)';
        const names = b.targets.map((t) => {
            const pool = t.kind === 'agent' ? doc.agents : t.kind === 'resource' ? doc.resources : doc.tracks;
            return pool.find((x) => x.id === t.id)?.name ?? t.id;
        });
        return b.mode === 'only' ? `${names.join(', ')}만 막음` : `${names.join(', ')} 빼고 막음`;
    };

    const sel = 'border border-slate-200 rounded px-2 py-1 text-xs';

    return (
        <Overlay title="블랙아웃 (가용성 차단)" onClose={() => setUI({ overlay: 'none' })}>
            {/* 추가 폼 */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-2 bg-slate-50 rounded">
                <input className={sel} placeholder="이름 (예: 재량휴업일)" value={name} onChange={(e) => setName(e.target.value)} />
                <input className={sel} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <select className={sel} value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setTargetId(''); }}>
                    <option value="holiday">휴일 (전부)</option>
                    <option value="agent">교사 복무</option>
                    <option value="resource">시설 차단</option>
                </select>
                {kind !== 'holiday' && (
                    <select className={sel} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                        <option value="">대상 선택</option>
                        {(kind === 'agent' ? doc.agents : doc.resources).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                )}
                <button onClick={add} className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">추가</button>
            </div>

            {/* 목록 */}
            <div className="space-y-1">
                {doc.blackouts.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 border border-slate-100 rounded text-xs hover:bg-slate-50">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] flex-shrink-0">{String(b.attr?.category ?? '기타')}</span>
                        <span className="font-medium text-slate-700">{b.name}</span>
                        <span className="text-slate-400">{b.startDate}{b.endDate !== b.startDate ? `~${b.endDate}` : ''}</span>
                        <span className="text-slate-400">· {describe(b)}</span>
                        <button onClick={() => dispatch({ type: 'REMOVE_BLACKOUT', id: b.id })} className="ml-auto text-slate-400 hover:text-red-500">×</button>
                    </div>
                ))}
                {doc.blackouts.length === 0 && <p className="text-xs text-slate-400 py-2">등록된 차단이 없습니다</p>}
            </div>
        </Overlay>
    );
}
