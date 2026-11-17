/**
 * 상태바 「지금 누구」(서버 모드) — 누르면 작은 팝오버에서 로그인·초대 코드 가입·로그아웃.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①) · 문구는 선생님이 읽는 쉬운 말.
 *   🔴 로그인 아이디 = 이메일(② 12절 1번 기본). 가입이 되면 곧바로 로그인 상태로 닫힌다(③ 10-3).
 *   로그아웃 확인은 ConfirmDialog(새 확인창 안 만든다).
 */
import { useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, ConfirmDialog, Popover, TextInput } from '../../../pane-ui-system';
import type { AccountServer } from '../session';
import { MIN_PASSWORD } from '../session';

type View = 'menu' | 'login' | 'signup';

export function ServerAccountStatus({ session }: { session: AccountServer }) {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => { const d = session.onIdentityChange(redraw); return () => d.dispose(); }, [session]);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const [view, setView] = useState<View>('menu');
    const [email, setEmail] = useState('');
    const [pw, setPw] = useState('');
    const [code, setCode] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [askOut, setAskOut] = useState(false);

    const cur = session.current();
    const isGuest = cur.kind !== 'user';
    const label = isGuest ? '로그인' : cur.displayName;

    const go = (v: View) => { setView(v); setPw(''); setMsg(''); };
    const close = () => { setAnchor(null); go(isGuest ? 'login' : 'menu'); setCode(''); };
    const toggle = (rect: DOMRect) => {
        if (anchor) { close(); return; }
        go(isGuest ? 'login' : 'menu');
        setAnchor(rect);
    };

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        const r = view === 'signup' ? await session.signUp(code, email, pw) : await session.signIn(email, pw);
        setBusy(false);
        if (r.ok) { close(); return; }
        setPw('');
        setMsg(r.message);
    };

    const msgEl = msg ? <p role="alert" data-acc-msg className="text-note text-warn">{msg}</p> : null;

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                data-acc-server-status
                onClick={(e) => toggle(e.currentTarget.getBoundingClientRect())}
                className="truncate max-w-[40vw]"
                title="서버 계정"
            >
                {label}
            </Button>
            {anchor && (
                <Popover anchor={anchor} onClose={close} width={280} align="right">
                    <div data-acc-pop className="flex flex-col gap-1.5 text-small text-text">
                        {!isGuest && view === 'menu' && (
                            <Form>
                                <p className="text-note text-muted">지금: <span className="text-text">{cur.displayName}</span></p>
                                <Row><Button variant="ghost" size="sm" onClick={() => { setAnchor(null); setAskOut(true); }}>로그아웃</Button></Row>
                            </Form>
                        )}
                        {isGuest && (view === 'login' || view === 'signup') && (
                            <Form>
                                <p className="text-note text-muted">{view === 'signup' ? '관리자에게 받은 초대 코드로 가입합니다.' : '학교 서버 계정으로 로그인합니다.'}</p>
                                {view === 'signup' && (
                                    <TextInput autoFocus aria-label="초대 코드" placeholder="초대 코드" autoComplete="off" value={code}
                                        onChange={(e) => setCode(e.target.value)} onEnter={() => { void submit(); }} />
                                )}
                                <TextInput autoFocus={view === 'login'} type="email" aria-label="이메일" placeholder="이메일" autoComplete="username" value={email}
                                    onChange={(e) => setEmail(e.target.value)} onEnter={() => { void submit(); }} />
                                <TextInput type="password" aria-label="비밀번호" placeholder={view === 'signup' ? `비밀번호(${MIN_PASSWORD}자 이상)` : '비밀번호'}
                                    autoComplete={view === 'signup' ? 'new-password' : 'current-password'} value={pw}
                                    onChange={(e) => setPw(e.target.value)} onEnter={() => { void submit(); }} />
                                {msgEl}
                                <Row>
                                    <Button variant="ghost" size="sm" onClick={() => go(view === 'signup' ? 'login' : 'signup')}>
                                        {view === 'signup' ? '로그인으로' : '초대 코드로 가입'}
                                    </Button>
                                    <Button variant="accent" size="sm" disabled={busy} onClick={() => { void submit(); }}>
                                        {view === 'signup' ? '가입하고 들어가기' : '로그인'}
                                    </Button>
                                </Row>
                            </Form>
                        )}
                    </div>
                </Popover>
            )}
            <ConfirmDialog
                open={askOut}
                title="로그아웃할까요?"
                confirmLabel="로그아웃"
                onConfirm={() => { setAskOut(false); void session.signOut(); }}
                onCancel={() => setAskOut(false)}
            >
                이 기기에서 서버 계정이 나갑니다. 다시 들어오려면 이메일과 비밀번호가 필요합니다.
            </ConfirmDialog>
        </>
    );
}

const Form = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-2">{children}</div>;
const Row = ({ children }: { children: ReactNode }) => <div className="flex items-center justify-end gap-2">{children}</div>;
