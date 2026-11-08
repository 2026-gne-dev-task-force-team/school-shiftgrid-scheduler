/**
 * 「구독 캘린더」 설정 판 — 목록(이름·색·마지막 갱신·켜기/끄기·새로고침·지우기) + 「링크로 구독」.
 *   🔴 모든 조작은 구독 모듈 함수로(노드에 저장) · 받기는 controller.refresh · 「파일로 넣기」는 pickIcsText(CORS 로 막힐 때 대안).
 *   🔴 색은 토큰 class 를 글자 그대로 쓴다(Tailwind JIT · 구조 검사 ①) — bg-${token} 조립 금지.
 */
import { useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { Button, Toggle, Icon } from '../../../pane-ui-system';
import { COLOR_TOKENS, CORS_HINT, type ColorToken, type SubNode } from '../model';
import { subscribeSubs, getSubsSnapshot, listSubs, addSub, updateSub, removeSub } from '../subscriptions';
import { refresh } from '../controller';
import { pickIcsText } from '../file-pick';

/** 토큰 → 색 점 class(리터럴). */
const DOT: Record<ColorToken, string> = {
    accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', accenth: 'bg-accenth',
};

function useSubs(): SubNode[] {
    useSyncExternalStore(subscribeSubs, getSubsSnapshot, getSubsSnapshot);
    return listSubs();
}

/** 마지막 갱신 'MM-DD HH:mm'(없으면 '아직 안 받음'). */
function fmtWhen(ms?: number): string {
    if (!ms) return '아직 안 받음';
    const d = new Date(ms);
    const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function Swatch({ sub }: { sub: SubNode }) {
    const cur = (sub.data.color ?? 'accent') as ColorToken;
    return (
        <span className="flex items-center gap-1">
            {COLOR_TOKENS.map((t) => (
                <button
                    key={t}
                    type="button"
                    aria-label={`색 ${t}`}
                    onClick={() => updateSub(sub.id, { color: t })}
                    className={`w-3.5 h-3.5 rounded-full ${DOT[t]} ${cur === t ? 'ring-2 ring-offset-1 ring-text/40' : 'opacity-50 hover:opacity-100'} transition-opacity`}
                />
            ))}
        </span>
    );
}

function SubRow({ sub }: { sub: SubNode }) {
    const d = sub.data;
    return (
        <div className="flex flex-col gap-1 py-2 border-b border-line last:border-b-0">
            <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[(d.color ?? 'accent') as ColorToken]}`} />
                <span className="font-semibold text-text truncate flex-1">{d.name || '구독'}</span>
                <Toggle on={d.enabled} onToggle={(v) => updateSub(sub.id, { enabled: v })} label="켜기/끄기" />
            </div>
            <div className="flex items-center gap-2 text-[12px] text-muted">
                <span className="truncate flex-1" title={d.url}>{d.url}</span>
                <span className="shrink-0 tabular-nums">{fmtWhen(d.lastFetched)}</span>
            </div>
            <div className="flex items-center gap-2">
                <Swatch sub={sub} />
                <span className="flex-1" />
                <Button size="sm" onClick={() => { void refresh(sub.id); }}>새로고침</Button>
                <Button size="sm" onClick={() => pickIcsText((text) => updateSub(sub.id, { lastIcs: text, lastFetched: Date.now(), lastError: undefined }))}>파일로 넣기</Button>
                <Button size="sm" onClick={() => removeSub(sub.id)}>지우기</Button>
            </div>
            {d.lastError && (
                <div className="flex items-start gap-1 text-[12px] text-warn">
                    <Icon name="warn" size={13} className="mt-0.5 shrink-0" />
                    <span>{d.lastError === CORS_HINT ? CORS_HINT : d.lastError}</span>
                </div>
            )}
        </div>
    );
}

function AddForm() {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const canAdd = url.trim().length > 0;
    const submit = () => {
        if (!canAdd) return;
        addSub(name.trim() || '구독', url.trim());
        setName('');
        setUrl('');
    };
    // 🔴 한글 조합 중 Enter 는 확정이지 제출이 아니다(isComposing || keyCode===229).
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !(e.nativeEvent.isComposing || (e as unknown as { keyCode: number }).keyCode === 229)) {
            e.preventDefault();
            submit();
        }
    };
    const field = 'h-btn px-2 rounded border border-line bg-bg text-text text-[13px] focus:outline-none focus:border-accent';
    return (
        <div className="flex flex-col gap-2 pt-1">
            <span className="font-semibold text-text">링크로 구독</span>
            <div className="flex items-center gap-2">
                <input className={`${field} w-28`} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} />
                <input className={`${field} flex-1`} placeholder="https:// 또는 webcal:// 주소" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={onKey} />
                <Button variant="accent" onClick={submit} disabled={!canAdd}>구독</Button>
            </div>
            <span className="text-[12px] text-muted">
                국가 공휴일 등의 .ics 주소를 넣으세요. 브라우저가 직접 못 받는 주소면 「파일로 넣기」로 파일을 넣을 수 있습니다.
            </span>
        </div>
    );
}

export function SubscribeSettings() {
    const subs = useSubs();
    return (
        <div className="flex flex-col gap-3 max-w-[640px] text-[13px] text-text">
            <p className="text-muted">
                링크(.ics)로 받은 달력을 내 달력에 겹쳐 보여 줍니다. 받아 온 일정은 보기만 하고 고칠 수 없습니다.
            </p>
            {subs.length === 0
                ? <p className="text-muted py-2">아직 구독이 없습니다. 아래에서 링크로 구독해 보세요.</p>
                : <div className="flex flex-col">{subs.map((s) => <SubRow key={s.id} sub={s} />)}</div>}
            <AddForm />
        </div>
    );
}
