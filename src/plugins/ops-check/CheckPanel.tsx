import { useRef, useState } from 'react';
import { Badge, Button, EmptyState, Icon, Segmented, Toolbar, ViewHeader } from '../../pane-ui-system';
import type { Severity } from '../../../shared/check/index.ts';
import { runCheck, isBundleText, type CheckView } from './run';
import { plainText, foldRows } from './plain';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { PlanCheck } from './PlanCheck';
import { adoptBundle } from '../../../shared/bundle/store.ts';

const TONE: Record<Severity, 'danger' | 'accent' | 'neutral'> = { error: 'danger', warn: 'accent', info: 'neutral' };
const WORD: Record<Severity, string> = { error: '오류', warn: '주의', info: '안내' };

export function CheckResult({ view }: { view: CheckView }) {
    const [detail, setDetail] = useState(false);
    if (view.kind === 'unreadable') return <EmptyState icon="ban" title={view.message} description="JSON 파일을 다시 골라 주세요." />;
    const n = (s: Severity) => view.issues.filter((i) => i.severity === s).length;
    return (
        <div className="flex flex-col gap-2">
            {view.blocking && <p className="text-small text-bad">막는 규칙이 있어 가져올 수 없습니다.</p>}
            {view.issues.length === 0
                ? <p className="text-small">✅ 통과 — 걸린 규칙이 없습니다.</p>
                : <div className="flex items-center gap-1.5"><Badge tone="danger">오류 {n('error')}</Badge><Badge tone="accent">주의 {n('warn')}</Badge><Badge tone="neutral">안내 {n('info')}</Badge></div>}
            {view.issues.length > 0 && <div><Button onClick={() => setDetail(!detail)}>{detail ? '자세히 접기' : '자세히'}</Button></div>}
            <ul className="flex flex-col gap-1">
                {foldRows(view.issues, detail).map((r, k) => r.kind === 'rest'
                    ? <li key={k} className="text-small text-muted flex items-baseline gap-2"><span>➕</span><span>그 밖에 {r.n}건</span></li>
                    : (
                        <li key={k} className="text-small flex items-baseline gap-2" title={`${r.issue.id} · ${r.issue.where}`}>
                            <Badge tone={TONE[r.issue.severity]}>{WORD[r.issue.severity]}</Badge>
                            {detail && <Badge tone={r.issue.severity === 'error' ? 'danger' : 'neutral'}>{r.issue.id}</Badge>}
                            {detail && <span className="text-muted">{r.issue.where}</span>}
                            <span>{plainText(r.issue)}</span>
                        </li>
                    ))}
            </ul>
        </div>
    );
}

type Tab = 'ops' | 'plan';

/** 두 탭 — 「운영 점검」(파일 검사 · 지금 것 그대로) · 「편성안 점검」. */
export function CheckPanel({ host }: { host: PluginHost }) {
    const [tab, setTab] = useState<Tab>('ops');
    return (
        <div className="h-full flex flex-col min-h-0">
            <ViewHeader icon={<Icon name="shieldCheck" size={14} />} title="데이터 검사" />
            <Toolbar>
                <Segmented<Tab>
                    label="점검 종류" value={tab} onChange={setTab}
                    options={[{ value: 'ops', label: '운영 점검' }, { value: 'plan', label: '편성안 점검' }]}
                />
            </Toolbar>
            <div className="flex-1 min-h-0 overflow-auto p-pad">
                {tab === 'ops' ? <OpsCheck /> : <PlanCheck host={host} />}
            </div>
        </div>
    );
}

export function OpsCheck() {
    const [view, setView] = useState<CheckView | null>(null);
    const [name, setName] = useState('');
    const [text, setText] = useState('');
    const [applied, setApplied] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <Button onClick={() => fileRef.current?.click()}>검사할 파일 고르기</Button>
                {/* oxlint-disable-next-line react/forbid-elements -- 숨은 파일 고르기 입력 */}
                <input
                    ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                    onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const t = await f.text();
                        setName(f.name); setText(t); setApplied('');
                        setView(runCheck(t));
                        e.target.value = '';
                    }}
                />
            </div>
            {view ? <><p className="text-small text-muted">{name}</p><CheckResult view={view} />
                {isBundleText(text) && (applied
                    ? <p className="text-small">{applied}</p>
                    : <div><Button onClick={async () => {
                        const r = await adoptBundle(text);
                        setApplied(r.ok ? '적용됨' : `적용하지 못했습니다 — ${r.reason}`);
                    }}>이 번들로 쓰기</Button></div>)}</>
                : <EmptyState compact icon="fileText" title="고른 파일이 없습니다" description="파일을 고르면 여기에 검사 결과가 나옵니다." />}
        </div>
    );
}
