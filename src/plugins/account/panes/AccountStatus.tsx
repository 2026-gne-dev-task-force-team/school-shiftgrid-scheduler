/**
 * 상태바 「지금 누구」 단추 — 지금 신분을 보여 주고, 누르면 작은 팝오버로 들어가고·나가고·바꾼다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 화면 문구는 선생님이 읽는 쉬운 말(「약속」「제공자」 같은 개발 낱말 ⛔).
 *   ⭐ W14 — 사용자로 들어가기는 **아이디 입력**으로 시작한다: 없음 / 비활성 / 첫 설정(종류 + 비밀번호 두 번) / 비밀번호.
 *   ⭐ W8 — 「로그아웃」은 명령 account.logout 하나를 부른다(명령 팔레트와 같은 길). 손님엔 숨김.
 *   Enter = 제출 · Esc = 닫기(팝오버) · 입력 칸은 열리면 바로 초점.
 */
import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { Button, Popover, Select, TextInput } from '../../../pane-ui-system';
import {
    getCurrent, loginMaster, openAccount, checkLoginId, loginWithPassword, setupAndLogin, credentialMethods,
} from '../core';
import { useAccountVersion } from './useAccount';

type View = 'menu' | 'master' | 'loginId' | 'setup' | 'password';

const LOGOUT_CMD = 'account.logout';

export function AccountStatus({ host }: { host: PluginHost }) {
    useAccountVersion();   // 신분·판정이 바뀌면 다시 그린다
    const btnRef = useRef<HTMLButtonElement>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [view, setView] = useState<View>('menu');
    const [loginId, setLoginId] = useState('');
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [method, setMethod] = useState('');
    const [target, setTarget] = useState<{ userId: string; name: string } | null>(null);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const cur = getCurrent();
    const isMaster = cur.kind === 'master';
    const isGuest = cur.kind === 'guest';
    const label = isMaster ? '마스터'
        : isGuest ? '손님'
            : `${cur.displayName}${cur.verified ? '' : ' (증명 안 됨)'}`;

    const go = (v: View) => { setView(v); setPw(''); setPw2(''); setMsg(''); };
    const close = () => { setAnchor(null); go('menu'); setLoginId(''); setTarget(null); };
    const toggle = () => {
        if (anchor) { close(); return; }
        go('menu');
        setAnchor(btnRef.current?.getBoundingClientRect() ?? null);
    };

    const enterMaster = async () => {
        if (!pw) { setMsg('암호를 입력하세요.'); return; }
        const ok = await loginMaster(pw);
        if (ok) close();
        else { setPw(''); setMsg('암호가 맞지 않습니다.'); }
    };

    /** 아이디 확인 → 갈래(없음·비활성은 메시지, 설정·비밀번호는 다음 화면). */
    const submitId = () => {
        const r = checkLoginId(loginId);
        if (r.kind === 'empty') { setMsg('아이디를 입력하세요.'); return; }
        if (r.kind === 'unknown') { setMsg(`「${loginId.trim()}」 아이디가 없습니다 — 철자를 확인하거나 관리자에게 물어보세요.`); return; }
        if (r.kind === 'inactive') { setMsg(`「${r.name}」 계정은 비활성입니다 — 관리자가 다시 켜야 들어갈 수 있습니다.`); return; }
        setTarget({ userId: r.userId, name: r.name });
        if (r.kind === 'setup') { setMethod(credentialMethods()[0]?.id ?? ''); go('setup'); }
        else go('password');
    };

    const submitPassword = async () => {
        if (!target || busy) return;
        if (!pw) { setMsg('비밀번호를 입력하세요.'); return; }
        setBusy(true);
        const r = await loginWithPassword(target.userId, pw);
        setBusy(false);
        if (r === 'ok') { close(); return; }
        setPw('');
        setMsg(r === 'wrong' ? '비밀번호가 맞지 않습니다.'
            : r === 'inactive' ? '이 계정은 비활성입니다.'
                : r === 'setup' ? '아직 비밀번호가 없습니다 — 아이디를 다시 넣어 처음 설정을 하세요.'
                    : '계정을 찾을 수 없습니다.');
    };

    const submitSetup = async () => {
        if (!target || busy) return;
        if (!pw || !pw2) { setMsg('비밀번호를 두 칸 모두 입력하세요.'); return; }
        if (pw !== pw2) { setPw2(''); setMsg('두 비밀번호가 다릅니다 — 확인 칸을 다시 입력하세요.'); return; }
        setBusy(true);
        const r = await setupAndLogin(target.userId, method, pw, pw2);
        setBusy(false);
        if (r === 'ok') { close(); return; }
        setMsg(r === 'method' ? '자격증명 종류를 고르세요.'
            : r === 'already' ? '이미 비밀번호가 설정된 계정입니다 — 비밀번호로 들어가세요.'
                : r === 'inactive' ? '이 계정은 비활성입니다.'
                    : r === 'empty' ? '비밀번호를 입력하세요.'
                        : r === 'mismatch' ? '두 비밀번호가 다릅니다.'
                            : '계정을 찾을 수 없습니다.');
    };

    const openAccountNode = () => {
        if (openAccount(host)) close();
        else setMsg('아직 계정이 없습니다 — 탐색기에서 「새로 만들기 ▸ 계정」으로 만드세요.');
    };
    const doLogout = () => { close(); host.commands.run(LOGOUT_CMD); };

    /** Enter 제출 — 한글 조합 중 Enter 는 넘긴다. Esc 는 Popover 가 닫는다. */
    const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); }
    };
    const back = (v: View) => <Button variant="ghost" size="sm" onClick={() => go(v)}>뒤로</Button>;
    const msgEl = msg ? <p role="alert" data-acc-msg className="text-note text-warn">{msg}</p> : null;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                data-acc-whoami
                onClick={toggle}
                className="shrink-0 px-1 rounded text-muted hover:text-text hover:bg-text/[0.06] transition-colors truncate max-w-[40vw]"
            >
                {label}
            </button>

            {anchor && (
                <Popover anchor={anchor} onClose={close} width={260} align="right">
                    <div data-acc-pop className="flex flex-col gap-1.5 text-small text-text">
                        <div className="px-1 pb-1 text-note text-muted border-b border-line">
                            지금: <span className="text-text">{label}</span>
                        </div>

                        {view === 'menu' && (
                            <>
                                {!isMaster && <MenuBtn onClick={() => go('master')}>마스터로 들어가기</MenuBtn>}
                                <MenuBtn onClick={() => go('loginId')}>{isGuest ? '사용자로 들어가기' : '다른 사용자로'}</MenuBtn>
                                {isMaster && <MenuBtn onClick={openAccountNode}>계정 열기</MenuBtn>}
                                {!isGuest && <MenuBtn data-acc-logout onClick={doLogout}>로그아웃</MenuBtn>}
                                {msg && <p className="text-note text-muted px-1">{msg}</p>}
                            </>
                        )}

                        {view === 'master' && (
                            <Form>
                                <p className="text-note text-muted">프로젝트 암호를 입력하세요.</p>
                                <TextInput type="password" autoFocus aria-label="프로젝트 암호" value={pw}
                                    onChange={(e) => { setPw(e.target.value); setMsg(''); }} onKeyDown={onEnter(enterMaster)} />
                                {msgEl}
                                <Row>{back('menu')}<Button variant="accent" size="sm" onClick={enterMaster}>들어가기</Button></Row>
                            </Form>
                        )}

                        {view === 'loginId' && (
                            <Form>
                                <p className="text-note text-muted">아이디를 입력하세요.</p>
                                <TextInput autoFocus data-acc-login-id aria-label="아이디" autoComplete="username" value={loginId}
                                    onChange={(e) => { setLoginId(e.target.value); setMsg(''); }} onKeyDown={onEnter(submitId)} />
                                {msgEl}
                                <Row>{back('menu')}<Button variant="accent" size="sm" onClick={submitId}>다음</Button></Row>
                            </Form>
                        )}

                        {view === 'password' && target && (
                            <Form>
                                <p className="text-note text-muted">「{target.name}」 — 비밀번호를 입력하세요.</p>
                                <TextInput type="password" autoFocus data-acc-pw aria-label="비밀번호" autoComplete="current-password" value={pw}
                                    onChange={(e) => { setPw(e.target.value); setMsg(''); }} onKeyDown={onEnter(submitPassword)} />
                                {msgEl}
                                <Row>{back('loginId')}<Button variant="accent" size="sm" disabled={busy} onClick={submitPassword}>들어가기</Button></Row>
                            </Form>
                        )}

                        {view === 'setup' && target && (
                            <Form>
                                <p className="text-note text-muted">「{target.name}」 — 처음 들어옵니다. 자격증명을 정하세요.</p>
                                <Select aria-label="자격증명 종류" value={method} onChange={(e) => setMethod(e.target.value)}
                                    options={credentialMethods().map((m) => ({ value: m.id, label: m.title }))} />
                                <TextInput type="password" autoFocus data-acc-pw aria-label="새 비밀번호" placeholder="새 비밀번호" autoComplete="new-password" value={pw}
                                    onChange={(e) => { setPw(e.target.value); setMsg(''); }} onKeyDown={onEnter(submitSetup)} />
                                <TextInput type="password" data-acc-pw2 aria-label="비밀번호 확인" placeholder="한 번 더" autoComplete="new-password" value={pw2}
                                    onChange={(e) => { setPw2(e.target.value); setMsg(''); }} onKeyDown={onEnter(submitSetup)} />
                                {msgEl}
                                <Row>{back('loginId')}<Button variant="accent" size="sm" disabled={busy} onClick={submitSetup}>설정하고 들어가기</Button></Row>
                            </Form>
                        )}
                    </div>
                </Popover>
            )}
        </>
    );
}

const Form = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-2">{children}</div>;
const Row = ({ children }: { children: ReactNode }) => <div className="flex items-center justify-end gap-2">{children}</div>;

/** 메뉴 한 줄 단추 — 공통 Button(plain). */
function MenuBtn({ onClick, children, ...rest }: { onClick: () => void; children: ReactNode } & Record<`data-${string}`, unknown>) {
    return (
        <Button variant="plain" size="sm" onClick={onClick} className="w-full text-left" {...rest}>
            {children}
        </Button>
    );
}
