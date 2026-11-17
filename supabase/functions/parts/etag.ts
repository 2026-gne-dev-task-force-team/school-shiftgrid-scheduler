// ④ 1절 ETag = `"<epoch>.<version>"` — epoch 은 projects.data_epoch(복원 때만 바뀜), version 은 조각마다 1부터.
// 조각이 아직 없으면 version 0 이고 첫 PUT 은 `If-Match: "<epoch>.0"`. 순수 함수.

export interface Tag {
    epoch: string;
    version: number;
}

const EPOCH_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TAG_RE = /^"?([A-Za-z0-9_-]{1,64})\.(0|[1-9]\d{0,9})"?$/;

export function formatEtag(epoch: string, version: number): string {
    if (!EPOCH_RE.test(epoch)) throw new Error('epoch 꼴이 아닙니다');
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('version 꼴이 아닙니다');
    return `"${epoch}.${version}"`;
}

/** `"e.v"`(따옴표 없는 꼴도 받음) → Tag. 약한 ETag(`W/`)·`*`·목록은 받지 않는다(null). */
export function parseTag(text: string | null | undefined): Tag | null {
    if (!text) return null;
    const m = TAG_RE.exec(text.trim());
    if (!m) return null;
    return { epoch: m[1], version: Number(m[2]) };
}

export const sameTag = (a: Tag, b: Tag) => a.epoch === b.epoch && a.version === b.version;

/**
 * `?known=` — `<조각>:<epoch>.<version>` 을 쉼표로 이은 것(예: `doc:"ab12.3",ops.rooms:ab12.1`).
 * 조각 이름이 있어야 「그 조각이 그대로냐」를 가를 수 있어 ETag 앞에 이름을 붙인다. 꼴이 틀린 항목은 버린다(그 조각은 내려간다).
 */
export function parseKnown(q: string | null | undefined): Map<string, Tag> {
    const out = new Map<string, Tag>();
    if (!q) return out;
    for (const item of q.split(',')) {
        const i = item.lastIndexOf(':');
        if (i <= 0) continue;
        const tag = parseTag(item.slice(i + 1));
        if (tag) out.set(item.slice(0, i).trim(), tag);
    }
    return out;
}
