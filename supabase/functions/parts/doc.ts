// D3 보관 칸·판 고르기(설계 ① 3절 「시간표 판본」 · 16절) — 지금 판 `doc` 과 보관 칸 `doc@<n>` 중 그날 쓸 판을 연다.
// 판정은 shared/doc-pick.ts(화면과 같은 함수): 기간이 그날을 덮는 것 중 최신, 없으면 최신.
// 기간이 암호문 안에 있어 열어 봐야 안다 — 최신부터 하나씩 열고 맞으면 멈춘다(지금 판이 맞는 보통 날은 한 번만 연다).

import { docOf, inPeriod, newestFirst, periodOf, pickVersion } from '../../../shared/doc-pick.ts';
import type { FnName } from '../_shared/crypto-scope.ts';
import type { KeyRing } from '../_shared/crypto/envelope.ts';
import { openRowBody, PART_COLS, toPartRow, type PartDbRow, type PartRow, type PartsReadDb } from '../_shared/doc.ts';

/** 고른 판 — `part` 는 `doc` 또는 `doc@<n>` · `doc` 은 시간표(v3 꼴) 자체(감싼 꼴이면 벗긴 것) · `body` 는 조각 본문 그대로 */
export interface PickedDoc {
    part: string;
    doc: unknown;
    body: unknown;
}

/** 지금 판·보관 칸 행 전부(암호문 그대로) — 최신 순 */
export async function readDocRows(db: PartsReadDb, projectId: string): Promise<PartRow[]> {
    const res = (await db.from('parts').select(PART_COLS).eq('project_id', projectId).or('part.eq.doc,part.like.doc@*')) as {
        data: PartDbRow[] | null;
        error: unknown;
    };
    if (res.error) throw new Error('parts 읽기 실패');
    const byName = new Map((res.data ?? []).map((r) => [r.part, r]));
    return newestFirst([...byName.keys()]).map((p) => toPartRow(byName.get(p)!));
}

/**
 * 그날(YYYY-MM-DD) 쓸 시간표 판을 연다. 판이 하나도 없으면 null.
 * 최신부터 열어 기간이 맞으면 그 판, 끝까지 없으면 최신 판. 복호 실패는 500 `decrypt_failed`(openRowBody 그대로).
 * `fn` = 여는 함수 — 보관본 `doc@<n>` 을 열 범위(crypto-scope.ts `doc@*`)가 있어야 한다.
 */
export async function openDocFor(fn: FnName, ring: KeyRing, db: PartsReadDb, projectId: string, date: string): Promise<PickedDoc | null> {
    const opened: PickedDoc[] = [];
    for (const row of await readDocRows(db, projectId)) {
        const body = await openRowBody(fn, ring, projectId, row);
        const v: PickedDoc = { part: row.part, doc: docOf(body), body };
        if (inPeriod(periodOf(body), date)) return v;
        opened.push(v);
    }
    return pickVersion(opened, (x) => periodOf(x.body), date);
}
