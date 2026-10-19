/**
 * 오른쪽 패널 = 도구 상자(모듈 2 — 쥔님 2026-10-19).
 *   표를 고르면: 이름 + 「꽂힌 컴포넌트」 목록(각각 속성 폼 · [적용] · [빼기]) + 「+ 꽂기」.
 *   아무것도 안 고르면(프로젝트): 학교 이름 · 학기.
 * 🔴 모듈 1·1.1 의 속성 패널(교시 수·요일·규칙 생성 → 표)은 기둥 3 을 거꾸로 밟은 것이었다 — 이걸로 뒤집는다.
 *   *"표는 수동으로 엑셀처럼 자유롭게 만들 수 있고, 도구 블록 같은 걸 넣어서 자동화하는 걸로"*
 *   *"유니티의 컴포넌트처럼 끼우면 (…) 속성을 매만지고 적용을 하면 적용이 되는 거지"*
 */
import { useState } from 'react';
import { useV2 } from '../store';
import { COMPONENT_LIST, COMPONENT_REGISTRY } from '../components/registry';
import { Icon } from '../../ui/parts/Icon';

export function Properties() {
    const st = useV2();
    if (st.selection.kind === 'project') return <ProjectProps />;
    return <SheetToolbox sheetId={st.selection.id} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-[11.5px] text-muted mb-1">{label}</span>
            {children}
        </label>
    );
}

const inputCls = 'w-full px-2 py-1.5 bg-panel text-text border border-line rounded text-[13px] focus:border-accent outline-none';

function ProjectProps() {
    const st = useV2();
    return (
        <div className="p-3 space-y-4">
            <h2 className="text-[13px] font-semibold text-text flex items-center gap-1.5">프로젝트 속성</h2>
            <Field label="학교 이름">
                <input className={inputCls} value={st.project.name}
                    placeholder="예: 고성초등학교"
                    onChange={(e) => st.setProjectMeta({ name: e.target.value })} />
            </Field>
            <Field label="학기">
                <input className={inputCls} value={st.project.term}
                    placeholder="예: 2026학년도 2학기"
                    onChange={(e) => st.setProjectMeta({ term: e.target.value })} />
            </Field>
            <p className="text-[11.5px] text-muted leading-relaxed pt-2 border-t border-line">
                왼쪽에서 표를 고르면 그 표의 도구 상자(이름·꽂힌 컴포넌트)가 여기 뜹니다.
            </p>
        </div>
    );
}

function SheetToolbox({ sheetId }: { sheetId: string }) {
    const st = useV2();
    const sheet = st.getSheet(sheetId);
    const [picking, setPicking] = useState(false);
    if (!sheet) return <div className="p-3 text-[13px] text-muted">표를 찾을 수 없습니다.</div>;

    return (
        <div className="p-3 space-y-4">
            <h2 className="text-[13px] font-semibold text-text">도구 상자</h2>

            <Field label="이름">
                <input className={inputCls} value={sheet.name}
                    onChange={(e) => st.renameSheet(sheetId, e.target.value)} />
            </Field>

            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11.5px] text-muted">꽂힌 컴포넌트</span>
                </div>
                <div className="space-y-2">
                    {sheet.components.length === 0 && (
                        <p className="text-[12px] text-muted leading-relaxed">
                            아직 꽂은 도구가 없습니다.<br />아래 「+ 꽂기」로 하나 꽂아 보세요.
                        </p>
                    )}
                    {sheet.components.map((inst) => (
                        <ComponentCard key={inst.instanceId} sheetId={sheetId} instanceId={inst.instanceId}
                            componentId={inst.componentId} props={inst.props} />
                    ))}
                </div>
            </div>

            {picking ? (
                <div className="border border-line rounded">
                    {COMPONENT_LIST.map((def) => (
                        <button key={def.id} type="button"
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-[12.5px] text-text hover:bg-panel2 text-left"
                            onClick={() => { st.addComponent(sheetId, def.id); setPicking(false); }}>
                            <Icon name="plus" size={13} /> {def.title}
                        </button>
                    ))}
                    <button type="button" className="w-full px-2.5 py-1.5 text-[11.5px] text-muted hover:text-text text-center border-t border-line"
                        onClick={() => setPicking(false)}>취소</button>
                </div>
            ) : (
                <button type="button" onClick={() => setPicking(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium border border-line text-text hover:bg-panel2">
                    <Icon name="plus" size={14} /> 꽂기
                </button>
            )}
        </div>
    );
}

function ComponentCard({
    sheetId, instanceId, componentId, props,
}: { sheetId: string; instanceId: string; componentId: string; props: Record<string, unknown> }) {
    const st = useV2();
    const [open, setOpen] = useState(true);
    const entry = COMPONENT_REGISTRY[componentId];
    if (!entry) {
        return (
            <div className="border border-line rounded px-2.5 py-2 text-[12px] text-muted">
                알 수 없는 컴포넌트({componentId})
                <button type="button" className="ml-2 text-bad" onClick={() => st.removeComponent(sheetId, instanceId)}>빼기</button>
            </div>
        );
    }
    const Form = entry.Form;
    return (
        <div className="border border-line rounded">
            <button type="button" onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-2.5 py-2 text-[12px] font-medium text-text hover:bg-panel2">
                <span>{entry.def.title}</span>
                <span className="text-muted">{open ? '▾' : '▸'}</span>
            </button>
            {open && (
                <div className="px-2.5 pb-2.5 pt-1 space-y-2 border-t border-line">
                    <Form props={props} onChange={(patch) => st.updateComponentProps(sheetId, instanceId, patch)} />
                    <div className="flex items-center gap-1.5 pt-1">
                        <button type="button"
                            className="flex-1 px-2 py-1.5 rounded bg-accent hover:bg-accenth text-white text-[12.5px] font-medium"
                            onClick={() => st.applyComponent(sheetId, instanceId)}>
                            적용
                        </button>
                        <button type="button"
                            className="px-2 py-1.5 rounded border border-line text-muted hover:text-bad hover:border-bad/50 text-[12.5px]"
                            onClick={() => st.removeComponent(sheetId, instanceId)}>
                            빼기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
