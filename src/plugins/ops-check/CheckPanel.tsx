import { useRef, useState } from 'react';
import { Badge, Button, EmptyState } from '../../pane-ui-system';
import type { Severity } from '../../../shared/check/index.ts';
import { runCheck, type CheckView } from './run';

const MARK: Record<Severity, string> = { error: '❌', warn: '⚠️', info: 'ℹ️' };

export function CheckResult({ view }: { view: CheckView }) {
    if (view.kind === 'unreadable') return <EmptyState icon="ban" title={view.message} description="JSON 파일을 다시 골라 주세요." />;
    const n = (s: Severity) => view.issues.filter((i) => i.severity === s).length;
    return (
        <div className="flex flex-col gap-2">
            {view.blocking && <p className="text-small text-bad">❌ 막는 규칙이 있어 가져올 수 없습니다.</p>}
            {view.issues.length === 0
                ? <p className="text-small">✅ 통과 — 걸린 규칙이 없습니다.</p>
                : <p className="text-small text-muted">❌ {n('error')} · ⚠️ {n('warn')} · ℹ️ {n('info')}</p>}
            <ul className="flex flex-col gap-1">
                {view.issues.map((i, k) => (
                    <li key={k} className="text-small flex items-baseline gap-2">
                        <span>{MARK[i.severity]}</span>
                        <Badge tone={i.severity === 'error' ? 'danger' : 'neutral'}>{i.id}</Badge>
                        <span className="text-muted">{i.where}</span>
                        <span>{i.message}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function CheckPanel() {
    const [view, setView] = useState<CheckView | null>(null);
    const [name, setName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <div className="p-4 flex flex-col gap-3 max-w-3xl">
            <div className="flex items-center gap-2">
                <Button onClick={() => fileRef.current?.click()}>검사할 파일 고르기</Button>
                {/* oxlint-disable-next-line react/forbid-elements -- 숨은 파일 고르기 입력 */}
                <input
                    ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                    onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setName(f.name);
                        setView(runCheck(await f.text()));
                        e.target.value = '';
                    }}
                />
            </div>
            {view ? <><p className="text-small text-muted">{name}</p><CheckResult view={view} /></>
                : <p className="text-small text-muted">파일을 고르면 여기에 검사 결과가 나옵니다.</p>}
        </div>
    );
}
