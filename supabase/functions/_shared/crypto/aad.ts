// ④ 2절 AAD 문자열 — 조립은 이 파일에서만 한다. 순수 함수(Deno·Node 공용).
// AAD(암호문에 묶는 꼬리표)가 다르면 열기가 실패한다 — 다른 프로젝트·행·판의 암호문을 옮겨 붙이는 것을 막는다.

const PREFIX = 'tt-ops|v1';

type Field = string | number;

// 칸 안에 구분자 `|` 가 있으면 두 다른 칸 조합이 같은 문자열이 될 수 있다 — 막는다.
function join(kind: string, fields: Field[]): string {
    for (const f of fields) {
        const s = String(f);
        if (s.includes('|')) throw new Error('aad_field_has_separator');
        if (s === '') throw new Error('aad_field_empty');
    }
    return [PREFIX, kind, ...fields.map(String)].join('|');
}

/** 조각: tt-ops|v1|part|<projectId>|<part>|<version>|<kid> */
export const aadPart = (projectId: string, part: string, version: number, kid: string) =>
    join('part', [projectId, part, version, kid]);

/** 보결 행: …|sub|<projectId>|<id>|<date>|<track>|<startMin>|<kid>|body 또는 take */
export const aadSub = (
    projectId: string, id: string, date: string, track: string, startMin: number,
    kid: string, which: 'body' | 'take',
) => join('sub', [projectId, id, date, track, startMin, kid, which]);

/** 예약 행: …|room|<projectId>|<id>|<roomId>|<date>|<startMin>|<slotNo>|<track>|<kid> */
export const aadRoom = (
    projectId: string, id: string, roomId: string, date: string, startMin: number,
    slotNo: number, track: string, kid: string,
) => join('room', [projectId, id, roomId, date, startMin, slotNo, track, kid]);

/** 감사: …|audit|<projectId>|<id>|<at>|<kid> */
export const aadAudit = (projectId: string, id: string, at: string, kid: string) =>
    join('audit', [projectId, id, at, kid]);

/** 계정 이름: …|user|<userId>|<kid> */
export const aadUser = (userId: string, kid: string) => join('user', [userId, kid]);

/** 프로젝트 이름: …|project|<projectId>|<kid> */
export const aadProject = (projectId: string, kid: string) => join('project', [projectId, kid]);
