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
    setKeyOverride, resetKeyOverride, resetAllKeyOverrides, Button, FOCUS_RING,
} from '../../../pane-ui-system';
import { listCommands, useContribVersion } from '../../../pane-ui-system/plugin';
import type { SettingsPaneProps } from '../registry';

const BTN = `h-7 px-2 rounded border border-line text-[12px] text-muted enabled:hover:text-text enabled:hover:bg-text/[0.04] disabled:opacity-30 ${FOCUS_RING}`;

export function KeybindingsPane(_: SettingsPaneProps) {
    useContribVersion();
    const o = useKeyOverrides();
    const [rec, setRec] = useState<string | null>(null);   // 키를 받는 중인 명령 id
    const [q, setQ] = useState('');

    // 받는 중엔 다음 키 하나를 가로챈다 — 캡처 단계라 전역 디스패처·뷰보다 먼저. Esc 는 취소.
    useEffect(() => {
        if (!rec) return;
        const h = (e: KeyboardEvent) => {
            const k = eventToKey(e);
            if (!k || e.isComposing) return;              // 수식 키만 — 다음 키를 기다린다
            e.preventDefault(); e.stopPropagation();
            if (k !== 'Escape') setKeyOverride(rec, k);
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
            <p className="text-[12px] text-muted">
                「바꾸기」를 누르고 새 키를 누르세요(Esc 는 취소). 같은 키를 둘이 쥐면 ⚠️ 가 뜨고 먼저 등록된 명령이 이깁니다. 저장은 이 기기에만 남습니다.
            </p>
            <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="명령·키로 찾기"
                className={`h-8 px-2 rounded border border-line bg-panel text-[13px] ${FOCUS_RING}`}
            />
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {cmds.map((c) => {
                    const k = effectiveKey(c.id, c.keys, o);
                    const def = normalizeKey(c.keys ?? '');
                    const clash = k && (map.get(k)?.length ?? 0) > 1;
                    const custom = c.id in o;
                    return (
                        <div key={c.id} className="flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0">
                            <span className="flex-1 min-w-0 truncate text-[13px]" title={`${c.id} · ${c.owner}`}>{c.title}</span>
                            {clash && <span className="text-[12px]" title={`겹침: ${map.get(k)!.join(', ')}`}>⚠️</span>}
                            <kbd className={`min-w-[72px] text-center text-[12px] ${custom ? 'text-text' : 'text-muted'}`}>
                                {rec === c.id ? '키를 누르세요…' : formatKey(k) || '—'}
                            </kbd>
                            <button type="button" className={BTN} onClick={() => setRec(rec === c.id ? null : c.id)}>
                                {rec === c.id ? '취소' : '바꾸기'}
                            </button>
                            <button type="button" className={BTN} disabled={!k} onClick={() => setKeyOverride(c.id, '')}>지우기</button>
                            <button type="button" className={BTN} disabled={!custom} title={def ? `기본: ${formatKey(def)}` : '기본 키 없음'} onClick={() => resetKeyOverride(c.id)}>기본값</button>
                        </div>
                    );
                })}
                {cmds.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">맞는 명령이 없습니다.</p>}
            </div>
            <div>
                <Button variant="ghost" size="md" onClick={resetAllKeyOverrides}>전부 기본값으로</Button>
            </div>
        </div>
    );
}
