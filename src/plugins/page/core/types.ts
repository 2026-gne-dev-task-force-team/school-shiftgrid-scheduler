/**
 * 🔴 페이지 블록 모델(순수 데이터 · 값 함수 조금) — 노션식 페이지 = 블록 배열.
 *   ⛔ 여기엔 React·DOM 이 없다(core 는 전부 순수 함수라 테스트로 박는다). 뷰는 이 위에 얹는다.
 *   저장은 이 Page 를 그대로 노드 data 에 넣는다(JSON 직렬화 그대로 · 왕복 안전).
 */

/** 블록 종류 — 문단·제목1~3·글머리표·번호·체크·인용·코드·구분선·표. */
export type BlockType =
    | 'paragraph'
    | 'heading1' | 'heading2' | 'heading3'
    | 'bulleted' | 'numbered' | 'todo'
    | 'quote' | 'code' | 'divider' | 'table';

/** 목록 종류(들여쓰기·같은 종류 이어짐 규칙이 붙는다). */
export const LIST_TYPES: BlockType[] = ['bulleted', 'numbered', 'todo'];

/** 표 블록 데이터 — 표 편집기(table 약속)의 TableColumn/TableRow 와 같은 모양의 순수 데이터만 든다. */
export interface TableBlockData {
    columns: { key: string; title: string; width?: number }[];
    rows: { id: string; cells: Record<string, string> }[];
}

/** 블록 하나 — text 는 인라인 마크다운 원본(굵게 `**` 등). divider 는 text 없음, table 은 table 칸을 쓴다. */
export interface Block {
    id: string;
    type: BlockType;
    text: string;
    /** 체크(todo 전용). */
    checked?: boolean;
    /** 목록 들여쓰기 깊이(0 부터). 목록 아닌 블록은 없음. */
    indent?: number;
    /** 표 블록 전용. */
    table?: TableBlockData;
}

/** 페이지 = 블록 배열. */
export interface Page {
    blocks: Block[];
}

let seq = 0;
/** 블록 id 생성 — 테스트는 구조로 비교하니 접두사+증가수로 충분하다(저장 왕복에도 안전). */
export function newId(prefix = 'b'): string {
    seq += 1;
    return `${prefix}${Date.now().toString(36)}_${seq}`;
}

/** 빈 블록(문단) 하나. */
export function emptyBlock(type: BlockType = 'paragraph'): Block {
    return { id: newId(), type, text: '' };
}

/** 첫 페이지 — 빈 문단 한 줄. */
export function emptyPage(): Page {
    return { blocks: [emptyBlock()] };
}

/** 목록 블록인가. */
export function isList(type: BlockType): boolean {
    return LIST_TYPES.includes(type);
}

/** 빈 표 하나(2×2) — 표 블록을 새로 넣을 때. */
export function emptyTable(): TableBlockData {
    return {
        columns: [{ key: 'c1', title: '열 1' }, { key: 'c2', title: '열 2' }],
        rows: [
            { id: newId('r'), cells: { c1: '', c2: '' } },
            { id: newId('r'), cells: { c1: '', c2: '' } },
        ],
    };
}
