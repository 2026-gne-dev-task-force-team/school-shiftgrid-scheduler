/**
 * 「창틀 > 단축키」 설정 Pane — 명령마다 키를 보고·바꾸고·지우고·기본값으로(쥔님 2026-11-09 *"키 바인딩 관리도"*).
 *   ⭐ 목록은 명령 스토어 전부다(「모든 동작은 명령」) — 플러그인이 명령을 내면 여기 저절로 뜬다.
 *   저장은 창틀 keybindings.ts(기기별) — 이 Pane 은 그리기만 한다.
 *
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { useEffect, useState } from 'react';
import {
    useKeyOverrides, effectiveKey, keyMap, formatKey, eventToKey, normalizeKey,
    setKeyOverride, resetKeyOverride, resetAllKeyOverrides, getKeyOverrides, restoreKeyOverrides, Button, TextInput,
} from '../../..';
import { listCommands, useContribVersion } from '../../../plugin';
import type { SettingsPaneProps } from '../registry';
import { notifyReset } from '../reset-undo';

/** 크롬이 먼저 먹어 페이지가 못 받는 키(재지정해도 안 돈다) — 짧은 고정 목록. */
const BROWSER_RESERVED = new Set(['Mod+N', 'Mod+T', 'Mod+W', 'Mod+Shift+T', 'Mod+Shift+N', 'Ctrl+Tab']);
export function isBrowserReserved(key: string): boolean { return BROWSER_RESERVED.has(normalizeKey(key)); }

export function KeybindingsPane({ host }: SettingsPaneProps) {
    useContribVersion();
    const o = useKeyOverrides();
    const [rec, setRec] = useState<string | null>(null);   // 키를 받는 중인 명령 id
    const [q, setQ] = useState('');
    const [reservedMsg, setReservedMsg] = useState('');   // 예약 키를 눌렀을 때 안내

    // 받는 중엔 다음 키 하나를 가로챈다 — 캡처 단계라 전역 디스패처·뷰보다 먼저. Esc 는 취소.
    useEffect(() => {
        if (!rec) return;
        const h = (e: KeyboardEvent) => {
            const k = eventToKey(e);
            if (!k || e.isComposing) return;              // 수식 키만 — 다음 키를 기다린다
            e.preventDefault(); e.stopPropagation();
            if (k === 'Escape') { setReservedMsg(''); }
            else if (isBrowserReserved(k)) { setReservedMsg(`${formatKey(k)} — 브라우저가 먼저 가로채는 키라 쓸 수 없습니다.`); }
            else { setReservedMsg(''); setKeyOverride(rec, k); }
            setRec(null);
        };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [rec]);

    const map = keyMap(o);
    const s = q.trim().toLowerCase();
    const cmds = listCommands()
        .filter((c) => !s || c.title.toLowerCase().includes(s) || c.id.toLowerCase().includes(s) || formatKey(effectiveKey(c.id, c.keys, o)).toLowerCase().includes(s))
        .sort((a, b) => a.title.localeCompare(b.title, 'ko'));

    return (
        <div className="flex flex-col gap-3 max-w-[640px]">
            <p className="text-small text-muted">
                「바꾸기」를 누르고 새 키를 누르세요(Esc 는 취소). 같은 키를 둘이 쥐면 ⚠️ 가 뜨고 먼저 등록된 명령이 이깁니다. 저장은 이 기기에만 남습니다.
            </p>
            {reservedMsg && <p role="alert" className="text-small">⚠️ {reservedMsg}</p>}
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="명령·키로 찾기" label="명령·키로 찾기" />
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {cmds.map((c) => {
                    const k = effectiveKey(c.id, c.keys, o);
                    const def = normalizeKey(c.keys ?? '');
                    const clash = k && (map.get(k)?.length ?? 0) > 1;
                    const custom = c.id in o;
                    return (
                        <div key={c.id} className="flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0">
                            <span className="flex-1 min-w-0 truncate text-body" title={`${c.id} · ${c.owner}`}>{c.title}</span>
                            {clash && <span className="text-small" title={`겹침: ${map.get(k)!.join(', ')}`}>⚠️</span>}
                            <kbd className={`min-w-[72px] text-center text-small ${custom ? 'text-text' : 'text-muted'}`}>
                                {rec === c.id ? '키를 누르세요…' : formatKey(k) || '—'}
                            </kbd>
                            <Button size="sm" onClick={() => setRec(rec === c.id ? null : c.id)}>
                                {rec === c.id ? '취소' : '바꾸기'}
                            </Button>
                            <Button size="sm" className="disabled:opacity-30" disabled={!k} onClick={() => setKeyOverride(c.id, '')}>지우기</Button>
                            <Button size="sm" className="disabled:opacity-30" disabled={!custom} title={def ? `기본: ${formatKey(def)}` : '기본 키 없음'} onClick={() => resetKeyOverride(c.id)}>기본값</Button>
                        </div>
                    );
                })}
                {cmds.length === 0 && <p className="px-3 py-2 text-small text-muted">맞는 명령이 없습니다.</p>}
            </div>
            <div>
                <Button variant="ghost" size="md" onClick={() => { const prev = getKeyOverrides(); resetAllKeyOverrides(); notifyReset(host, '단축키를 전부 기본값으로 되돌렸습니다', () => restoreKeyOverrides(prev)); }}>전부 기본값으로</Button>
            </div>
        </div>
    );
}
