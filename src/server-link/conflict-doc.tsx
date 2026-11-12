/**
 * 시간표 칸(`doc`·`ops.settings`) 412 — 버튼 둘 (1.2v 설계 ① 12절 · P7).
 *   「서버 판 열기」: 내 판을 파일로 먼저 내려받고 → 서버 판으로 바꾼다.
 *   「내 판으로 덮기」: 확인 → 서버 판을 파일로 먼저 받고 → 서버 ETag 로 내 값을 다시 PUT. 강제 덮어쓰기는 없다.
 *   `doc` 은 한 덩이라 항목 단위로 다시 입힐 수 없어서 둘 중 하나다. 내려받기·확인창·큐는 주입식.
 */
import { Button } from '../pane-ui-system/primitives/Button';
import type { PartQueue } from './parts';

export interface ConflictDocProps {
    /** 칸 이름 — 내려받는 파일 이름에도 쓴다. */
    part: string;
    /** 412 가 돌려준 서버 본문. */
    serverBody: unknown;
    /** 서버 판의 ETag. */
    serverEtag: string;
    /** 내 값. */
    mine: unknown;
    download: (name: string, text: string) => void;
    confirm: (message: string) => boolean | Promise<boolean>;
    queue: Pick<PartQueue, 'resolve'>;
}

const text = (v: unknown) => JSON.stringify(v, null, 2) ?? '';

export function ConflictDoc({ part, serverBody, serverEtag, mine, download, confirm, queue }: ConflictDocProps) {
    const openServer = async () => {
        download(`${part}-내판.json`, text(mine));
        await queue.resolve(part, { etag: serverEtag, value: serverBody, keep: 'server' });
    };
    const overwrite = async () => {
        if (!(await confirm('서버 판을 내 판으로 덮습니다. 서버 판은 먼저 파일로 받아 둡니다. 계속할까요?'))) return;
        download(`${part}-서버판.json`, text(serverBody));
        await queue.resolve(part, { etag: serverEtag, value: mine, keep: 'mine' });
    };
    return (
        <div role="group" aria-label={`${part} 충돌`}>
            <p>다른 곳에서 먼저 고쳐서 「{part}」 칸이 막혔습니다.</p>
            <Button onClick={() => { void openServer(); }}>서버 판 열기</Button>
            <Button tone="danger" onClick={() => { void overwrite(); }}>내 판으로 덮기</Button>
        </div>
    );
}
