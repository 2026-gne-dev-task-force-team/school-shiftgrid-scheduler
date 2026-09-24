/** 엑셀 불러오기 / 빈 양식 내려받기 — 오류는 목록으로, 반영 여부는 사람이 누른다 */
import { useState } from 'react';
import { useStore } from '../../../store/store';
import { parseDemandsWorkbook, blankWorkbook, type ImportResult } from '../../../io/excel';
import { platform } from '../../../platform';
import { Button, Modal, Mark } from '../../parts/ui';

export default function ExcelBar() {
    const st = useStore();
    const [result, setResult] = useState<ImportResult | null>(null);

    const doImport = async () => {
        const picked = await st.runEngineAsync('엑셀 불러오기', () => platform.importFile('.xlsx,.xls'));
        if (!picked) return;
        const r = st.runEngine('시수표 읽기', () => parseDemandsWorkbook(picked.bytes, st.doc));
        if (r) setResult(r);
    };

    const doBlank = async () => {
        const bytes = st.runEngine('빈 양식 만들기', () => blankWorkbook(st.doc));
        if (bytes) await st.runEngineAsync('양식 내려받기', () =>
            platform.exportFile(`${st.doc.meta.name || '시간표'}-빈양식.xlsx`, bytes,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    };

    const apply = () => {
        if (result) { st.act.mergeImport(result); setResult(null); }
    };

    const addCount = result ? result.agents.length + result.tracks.length + result.activities.length + result.demands.length : 0;

    return (
        <div className="flex items-center gap-1.5">
            <Button icon="upload" onClick={doImport}>엑셀 불러오기</Button>
            <Button icon="download" onClick={doBlank}>빈 양식 내려받기</Button>

            {result && (
                <Modal title="엑셀 불러오기 결과" onClose={() => setResult(null)}>
                    <div className="space-y-3 text-[13px]">
                        <div className="grid grid-cols-4 gap-2 text-center">
                            {[['교사', result.agents.length], ['반', result.tracks.length], ['과목', result.activities.length], ['시수', result.demands.length]].map(([k, v]) => (
                                <div key={k} className="bg-panel2 rounded-md py-2 border border-line">
                                    <div className="text-[18px] font-semibold">{v}</div><div className="text-[11px] text-muted">{k}</div>
                                </div>
                            ))}
                        </div>
                        {result.errors.length > 0 && (
                            <div className="rounded-md border border-warn/40 bg-warn/10 p-2">
                                <div className="flex items-center gap-1 text-[12px] font-medium mb-1"><Mark kind="warn" /> 확인할 점 {result.errors.length}건</div>
                                <ul className="list-disc pl-5 space-y-0.5 text-[12px] text-muted">
                                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                                </ul>
                            </div>
                        )}
                        <p className="text-[12px] text-muted">위 내용을 시수표에 반영할지 직접 고르세요. 반영해도 되돌리기(⌘Z)로 취소할 수 있습니다.</p>
                        <div className="flex justify-end gap-2">
                            <Button variant="soft" onClick={() => setResult(null)}>취소</Button>
                            <Button variant="primary" icon="check" onClick={apply} disabled={addCount === 0}>{addCount}건 반영하기</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
