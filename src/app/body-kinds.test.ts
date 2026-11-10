import { describe, expect, it } from 'vitest';
import { BODY_KINDS } from '../pane-ui-system/core/nodes/contracts/nodes';
import { pageNodeTypes } from '../plugins/page/nodes';
import { tableNodeTypes } from '../plugins/sheet/nodes';
import { recordNodeTypes } from '../plugins/collection/nodes';
import { peopleNodeTypes } from '../plugins/people/nodes';
import { roomsNodeTypes } from '../plugins/rooms/nodes';
import { calendarNodeTypes } from '../plugins/calendar/nodes';

describe('노드 타입 body 칸 — 본문 종류 등록 표', () => {
    const all = [...pageNodeTypes, ...tableNodeTypes, ...recordNodeTypes, ...peopleNodeTypes, ...roomsNodeTypes, ...calendarNodeTypes];
    it('body 를 적은 타입은 모두 BODY_KINDS 에 있고, 본문 타입 여섯이 적었다', () => {
        const withBody = all.filter((t) => t.body);
        expect(withBody.length).toBe(6);
        for (const t of withBody) expect(Object.keys(BODY_KINDS)).toContain(t.body);
    });
});
