/**
 * 상태바 「지금 누구」 단추 — 지금 신분을 보여 주고, 누르면 작은 메뉴로 들어가고·나가고·바꾼다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 화면 문구는 선생님이 읽는 쉬운 말(「약속」「제공자」 같은 개발 낱말 ⛔).
 *   ⚠️ 상태바 항목은 truncate span 안에 들어가므로, 펼치는 메뉴는 fixed 로 띄워 잘리지 않게 한다(상태바 바로 위).
 *   core 만 쓴다 — 새 정책·기본값을 짓지 않는다(바닥 정책 0). 프로젝트 암호 입력은 이 플러그인의 작은 입력창으로 받는다.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { Button } from '../../../pane-ui-system';
import { getCurrent, listUsers, login, loginMaster, logout, openAccount } from '../core';
import { useAccountVersion } from './useAccount';

type View = 'menu' | 'master' | 'users';

export function AccountStatus({ host }: { host: PluginHost }) {
    useAccountVersion();   // 신분·판정이 바뀌면 다시 그린다
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<View>('menu');
    const [pw, setPw] = useState('');
    const [msg, setMsg] = useState('');

    const cur = getCurrent();
    const isMaster = cur.kind === 'master';
    const label = isMaster ? '마스터'
        : cur.kind === 'guest' ? '손님'
            : `${cur.displayName}${cur.verified ? '' : ' (증명 안 됨)'}`;

    const reset = () => { setView('menu'); setPw(''); setMsg(''); };
    const close = () => { setOpen(false); reset(); };
    const toggle = () => { if (open) close(); else { reset(); setOpen(true); } };

    const enterMaster = async () => {
        const ok = await loginMaster(pw);
        if (ok) close();
        else setMsg('암호가 맞지 않습니다.');
    };
    const pickUser = async (id: string) => {
        close();                 // 메뉴를 먼저 닫는다 — 증명 입력창과 겹치지 않게
        await login(id);         // 정책이 증명을 요구하거나 마스터 전환이면 증명 입력창이 뜬다
    };
    const doLogout = () => { logout(); close(); };
    const openAccountNode = () => {
        const ok = openAccount(host);
        if (ok) close();
        else setMsg('아직 계정이 없습니다 — 탐색기에서 「새로 만들기 ▸ 계정」으로 만드세요.');
    };

    const users = open && view === 'users' ? listUsers() : [];

    return (
        <>
            <button
                type="button"
                onClick={toggle}
                className="shrink-0 px-1 rounded text-muted hover:text-text hover:bg-text/[0.06] transition-colors truncate max-w-[40vw]"
            >
                {label}
            </button>

            {open && (
                <>
                    {/* 바깥을 눌러 닫기 */}
                    <div className="fixed inset-0 z-40" onClick={close} />
                    <div
                        className="fixed right-2 z-50 w-[240px] rounded-lg border border-line bg-panel p-2 flex flex-col gap-1.5 text-[12px] text-text"
                        style={{ bottom: 'calc(var(--s-statusbar) + 6px)' }}
                    >
                        <div className="px-1 pb-1 text-[11px] text-muted border-b border-line">
                            지금: <span className="text-text">{label}</span>
                        </div>

                        {view === 'menu' && !isMaster && (
                            <>
                                <MenuBtn onClick={() => { setMsg(''); setView('master'); }}>마스터로 들어가기</MenuBtn>
                                <MenuBtn onClick={() => setView('users')}>사용자로 들어가기</MenuBtn>
                                <MenuBtn onClick={doLogout}>나가기</MenuBtn>
                            </>
                        )}

                        {view === 'menu' && isMaster && (
                            <>
                                <MenuBtn onClick={() => setView('users')}>다른 사용자로</MenuBtn>
                                <MenuBtn onClick={openAccountNode}>계정 열기</MenuBtn>
                                {msg && <p className="text-[11px] text-muted px-1">{msg}</p>}
                            </>
                        )}

                        {view === 'master' && (
                            <div className="flex flex-col gap-2">
                                <p className="text-[11px] text-muted">프로젝트 암호를 입력하세요.</p>
                                <input
                                    type="password"
                                    autoFocus
                                    value={pw}
                                    onChange={(e) => setPw(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') enterMaster(); if (e.key === 'Escape') close(); }}
                                    className="rounded border border-line bg-side text-text px-2 py-1 text-[13px]"
                                />
                                {msg && <p className="text-[11px] text-warn">{msg}</p>}
                                <div className="flex items-center justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { setMsg(''); setView('menu'); }}>뒤로</Button>
                                    <Button variant="accent" size="sm" onClick={enterMaster}>들어가기</Button>
                                </div>
                            </div>
                        )}

                        {view === 'users' && (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-[11px] text-muted">이름을 고르세요.</p>
                                {users.length === 0
                                    ? <p className="text-[11px] text-muted px-1">등록된 사용자가 없습니다.</p>
                                    : (
                                        <div className="flex flex-col gap-1 max-h-[40vh] overflow-auto">
                                            {users.map((u) => (
                                                <MenuBtn key={u.id} onClick={() => pickUser(u.id)}>{u.data.displayName}</MenuBtn>
                                            ))}
                                        </div>
                                    )}
                                <div className="flex items-center justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => setView('menu')}>뒤로</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
}

/** 메뉴 한 줄 단추 — 토큰 색만. */
function MenuBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left px-2 py-1 rounded text-[12px] text-text hover:bg-text/[0.06] transition-colors"
        >
            {children}
        </button>
    );
}
