/**
 * 시수표 위 「엑셀에서 붙여 넣기」 띠 — 글자 칸에 붙이면 미리 해석해 보여 주고, 사람이 「표에 넣기」 를 눌러야 반영한다.
 *   🔴 정본에 없는 이름은 저장하지 않고 「정본에 없음 n건」 으로만 보여 준다. 기초 정보를 만들지 않는다.
 *   해석은 paste.ts(순수) — 여기는 얇은 화면뿐.
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Textarea } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { CollectionKit } from '../collection/contracts/collection';
import type { Canon } from './resolve';
import { parseDemandPaste, applyPaste, pasteSummary } from './paste';

export function PasteBar({ host, kit }: { host: PluginHost; kit: CollectionKit }) {
    // 보고 있는 시수표가 바뀌면(열기·닫기) 다시 그린다.
    const listId = useSyncExternalStore((fn) => { const d = kit.onChange(fn); return () => d.dispose(); }, () => kit.active());
    const [text, setText] = useState('');
    const [done, setDone] = useState<string | null>(null);
    const canon: Canon = {
        staff: host.modules.use<Staff>('staff') ?? null,
        school: host.modules.use<School>('school') ?? null,
        subjects: host.modules.use<Subjects>('subjects') ?? null,
    };
    // 글자가 바뀔 때만 해석한다(정본 읽기는 그 순간 값).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const plan = useMemo(() => (text.trim() === '' ? null : parseDemandPaste(text, canon)), [text]);
    if (!listId) return null;

    const put = () => {
        if (!plan || plan.rows.length === 0) return;
        const made = applyPaste(kit, listId, plan.rows);
        setDone(`${made.length}줄을 표에 넣었습니다.`);
        setText('');
    };

    return (
        <details style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
            <summary>엑셀에서 복사한 표 붙여 넣기</summary>
            <p style={{ margin: '6px 0' }}>엑셀에서 교사·반·과목·시수 열을 복사해 아래에 붙이세요(머리글은 있어도 없어도 됩니다). 이름은 교직원 명단·학교 정보·과목 목록과 맞춰 보고, 없는 이름은 저장하지 않고 알려 드립니다.</p>
            <Textarea
                label="엑셀 붙여 넣기 칸" rows={5}
                value={text} onChange={(e) => { setText(e.target.value); setDone(null); }}
                placeholder={'교사\t반\t과목\t시수'}
            />
            {plan && (
                <ul style={{ margin: '6px 0' }}>
                    {pasteSummary(plan).map((line, i) => <li key={i}>{line}</li>)}
                </ul>
            )}
            {done && <p role="status">{done}</p>}
            <Button variant="accent" disabled={!plan || plan.rows.length === 0} onClick={put}>표에 넣기</Button>
        </details>
    );
}
