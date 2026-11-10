/**
 * 시작 화면 환영 카드 — 처음 켠 선생님 안내(이 앱으로 무엇을 하나 · 첫 걸음 3개 · 다시 보지 않기) + 「지금 할 일」 한 줄.
 *   걸음은 실제 있는 명령에만 잇는다(없으면 그 줄을 뺀다). 「다시 보지 않기」는 플러그인 저장(host.storage)에 기억한다.
 *   🔴 다시 켜는 길: 닫은 뒤엔 시작 화면에 「안내 다시 보기」 글자 단추가 남는다(설정 쪽은 만들지 않았다).
 */
import { useEffect, useState } from 'react';
import type { Staff } from '../../staff/contracts/staff';
import { Button } from '../../../pane-ui-system';
import { getHost } from '../nodes';
import { nextStepLine, nextStepTarget, type StepKey } from './nextStep';

export const WELCOME_KEY = 'welcomeDismissed';
/** 다른 꾸러미의 화면 이름(명령 id 가 아니라 화면 id — 있으면 연다, 없으면 그 걸음을 뺀다). */
const STAFF_VIEW = 'staff.sheet';
const CALENDAR_VIEW = 'calendar.month';

interface Step { key: StepKey; label: string; run: () => void }

export function WelcomeCard({ sheets, onMake }: { sheets: number; onMake: () => void }) {
    const host = getHost();
    const [hidden, setHidden] = useState<boolean>(() => host?.storage.get<boolean>(WELCOME_KEY, false) ?? false);
    const [, bump] = useState(0);
    const staff = host?.modules.use<Staff>('staff') ?? null;
    useEffect(() => {
        const d = staff?.onChange(() => bump((n) => n + 1));
        return () => { d?.dispose(); };
    }, [staff]);

    const hasStaff = !!host?.views.get(STAFF_VIEW);
    const hasCalendar = !!host?.views.get(CALENDAR_VIEW);
    const staffFilled = !!staff && staff.lists().some((l) => staff.staffIn(l.id).length > 0);

    const steps: Step[] = [];
    if (hasStaff) steps.push({ key: 'staff', label: '선생님 명단 만들기', run: () => { host?.workspace.open(STAFF_VIEW, { where: 'center' }); } });
    steps.push({ key: 'make', label: '시간표 만들기', run: onMake });
    if (hasCalendar) steps.push({ key: 'calendar', label: '달력에서 보기', run: () => { host?.workspace.open(CALENDAR_VIEW, { where: 'center' }); } });

    const input = { hasStaff, staffFilled, sheets, hasCalendar };
    const target = nextStepTarget(input);
    const nowLine = (
        <div className="flex items-center gap-2 text-small text-text" data-testid="next-step">
            <span className="text-muted shrink-0">지금 할 일</span>
            <span>{nextStepLine(input)}</span>
            {hidden && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setDismissed(false)}>안내 다시 보기</Button>
            )}
        </div>
    );

    const setDismissed = (v: boolean) => { host?.storage.set(WELCOME_KEY, v); setHidden(v); };

    return (
        <div className="shrink-0 w-full max-w-xl mx-auto px-6 pt-6 flex flex-col gap-3" data-testid="welcome">
            {!hidden && (
                <div className="rounded-lg border border-line px-4 py-3 flex flex-col gap-2" data-testid="welcome-card">
                    <div className="text-body font-medium text-text">환영합니다</div>
                    <div className="text-small text-muted">이 앱으로 선생님·반별 시간표를 만들고 한눈에 봅니다.</div>
                    {nowLine}
                    <ol className="flex flex-col gap-1">
                        {steps.map((s, i) => (
                            <li key={s.label} className={s.key === target ? 'rounded border border-accent' : undefined}
                                data-current={s.key === target ? 'true' : undefined}>
                                <Button size="sm" variant="ghost" onClick={s.run}>{i + 1}. {s.label}</Button>
                                {s.key === target && <span className="text-small text-accent ml-1">← 지금</span>}
                            </li>
                        ))}
                    </ol>
                    <Button size="sm" variant="ghost" className="self-end" onClick={() => setDismissed(true)}>다시 보지 않기</Button>
                </div>
            )}
            {hidden && nowLine}
        </div>
    );
}
