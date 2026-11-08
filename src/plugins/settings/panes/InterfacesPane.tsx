/**
 * 「약속(인터페이스)」 설정 Pane — ⑤ 약속 하나를 고르면 **채운 모듈(제공자)**·**기다리는 플러그인**
 *   (requires·supports 로 기대는 쪽, 지금 붙었나)을 보여 준다.
 *
 * 🔴 ⛔ 「약속 = contract-* 플러그인」이라는 가정에 묶지 않는다 — 호스트가 주는 약속 목록(켜진 플러그인들의
 *    contributes.interfaces 모음)을 listPromiseRows 가 읽어 그린다. 약속 출처가 매니페스트로 옮겨가도 이 화면은 덜 바뀐다.
 * 🔴 셈은 전부 화면 밖 순수 함수(plugin-graph). 여기선 그리기만 한다.
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { useState } from 'react';
import { Icon, FOCUS_RING } from '../../../pane-ui-system';
import { listPlugins, usePluginRegistry } from '../../../pane-ui-system/plugin';
import { listPromiseRows, promiseDetail } from '../plugin-graph';

const REL_LABEL = { requires: '꼭 필요', supports: '있으면 씀' } as const;

export function InterfacesPane() {
    usePluginRegistry();   // 약속 플러그인·제공자를 켜고 끄면 다시 그린다
    const all = listPlugins();
    const rows = listPromiseRows(all).sort((a, b) => a.name.localeCompare(b.name));
    const [openName, setOpenName] = useState<string | null>(null);

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted leading-relaxed">
                지금 켜진 플러그인들이 선언한 약속입니다. 약속은 「끼워 갈아 낄 자리」예요 — 한 쪽이 채우고(제공자),
                다른 쪽이 그 약속에 기댑니다. 줄을 누르면 누가 채우고 누가 기다리는지 펼쳐집니다.
            </p>
            {rows.length === 0
                ? <p className="text-[12px] text-muted">선언된 약속이 없습니다(약속 플러그인이 전부 꺼졌거나 없습니다).</p>
                : (
                    <div className="flex flex-col rounded border border-line overflow-hidden">
                        {rows.map((r) => {
                            const open = openName === r.name;
                            const d = open ? promiseDetail(r.name, all) : null;
                            return (
                                <div key={r.name} className="border-b border-line last:border-b-0">
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setOpenName((cur) => (cur === r.name ? null : r.name))}
                                        className={`w-full text-left flex items-center gap-2 px-3 py-2 min-h-row hover:bg-text/[0.03] transition-colors ${FOCUS_RING}`}
                                    >
                                        <Icon name="right" size={12} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                                        <Icon name="layers" size={13} className="shrink-0 text-muted" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] font-mono text-text truncate">{r.name}</span>
                                                <span className="text-[11px] text-muted">{r.version}</span>
                                                {!r.available && <span className="text-[11px] px-1.5 rounded bg-warn/15 text-warn">못 씀</span>}
                                            </div>
                                            <span className="text-[11px] text-muted">
                                                {r.provider ? `채움: ${r.provider.name}` : '채운 모듈 없음'} · 기다리는 쪽 {r.consumerCount}
                                            </span>
                                        </div>
                                    </button>
                                    {open && d && (
                                        <div className="px-3 pb-3 pl-9 bg-side/40 border-t border-line flex flex-col gap-2 pt-2">
                                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                                                <dt className="text-muted">선언한 약속 플러그인</dt>
                                                <dd className="text-text">{d.declaredBy?.name ?? '—'}</dd>
                                                <dt className="text-muted">채운 모듈(제공자)</dt>
                                                <dd className="text-text">{d.provider?.name ?? <span className="text-warn">없음 — 아무도 안 채웁니다</span>}</dd>
                                            </dl>
                                            <div className="flex flex-col gap-1">
                                                <h5 className="text-[11px] font-medium text-muted">기다리는 플러그인 <span className="text-muted/70">{d.consumers.length}</span></h5>
                                                {d.consumers.length === 0
                                                    ? <p className="text-[12px] text-muted">이 약속을 기대는 플러그인이 없습니다.</p>
                                                    : (
                                                        <div className="flex flex-col rounded border border-line overflow-hidden">
                                                            {d.consumers.map((c) => (
                                                                <div key={c.id} className="flex items-center gap-2 px-2.5 py-1 border-b border-line last:border-b-0">
                                                                    <span className="text-[12px] text-text truncate">{c.name}</span>
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-side text-muted shrink-0">{REL_LABEL[c.relation]}</span>
                                                                    <span className={`text-[11px] ml-auto shrink-0 ${c.attached ? 'text-accent' : 'text-muted'}`}>
                                                                        {c.attached ? '붙음' : '안 붙음'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
        </div>
    );
}
