/**
 * 문서 데모 「메모」 뷰 — textarea 하나. 치면 host.doc.set({text}) 로 문서에 쓴다.
 *   ⭐ host 는 클로저로 받는다(요구명세 「뷰가 host 를 쓰는 길은 클로저」) — ViewProps 는 안 건드린다.
 *   🔴 문서가 바뀌거나(다른 창이 쓰거나) 새 파일이 열리면(on change/open) 다시 읽어 textarea 를 맞춘다.
 */
import { useEffect, useState } from 'react';
import type { ViewProps, PluginHost } from '../../../pane-ui-system/plugin';

interface Memo { text?: string }

export function makeMemoView(host: PluginHost) {
    return function MemoView(_: ViewProps) {
        const [text, setText] = useState<string>(() => host.doc.get<Memo>()?.text ?? '');

        useEffect(() => {
            const read = () => setText(host.doc.get<Memo>()?.text ?? '');
            const d1 = host.doc.on('change', read);
            const d2 = host.doc.on('open', read);
            read();   // 마운트 때 지금 값으로 맞춘다(임시 보관 복귀분 포함)
            return () => { d1.dispose(); d2.dispose(); };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        return (
            <div className="h-full flex flex-col p-4 gap-2">
                <p className="text-[12px] text-muted">
                    이 메모는 <span className="font-mono text-text">doc.plugins.doc-demo</span> 에 저장된다 ·
                    열기/저장·새로고침 뒤에도 돌아온다
                </p>
                <textarea
                    data-testid="memo-input"
                    className="flex-1 w-full resize-none rounded border border-line bg-panel2 text-text p-3 text-[13px] leading-relaxed outline-none focus:border-accent"
                    placeholder="여기에 적으면 문서에 저장됩니다"
                    value={text}
                    onChange={(e) => {
                        const v = e.target.value;
                        setText(v);
                        host.doc.set<Memo>({ text: v });
                    }}
                />
            </div>
        );
    };
}
