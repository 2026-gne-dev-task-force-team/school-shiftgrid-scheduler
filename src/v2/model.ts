/**
 * ══════════════════════════════════════════════════════════════
 *  v2 저장 모델 — 「작업대」의 세계 (schemaVersion: 4)
 * ══════════════════════════════════════════════════════════════
 *
 * v1 은 「반·교사·과목을 먼저 등록해야 다음으로 가는」 마법사였다. v2 는 엑셀이다:
 * 켜면 빈 작업대, 표를 만들고 바로 칸을 만진다. 똑똑한 기능은 나중에 붙이는 모듈이다.
 *
 * ── 뼈대 ──────────────────────────────────────────────────────
 *   Project  파일 한 장 = 프로젝트(학교·학기) 하나. 그 밑에 표(Sheet)들이 산다.
 *   Sheet    「주인 없는 이름 있는 주간 격자」 하나. 1-1반 표든 전담 표든 다 똑같은 표다.
 *   Cell     격자의 한 칸. 지금은 글자뿐이지만 「값 하나」를 담는 구조다(나중에 참조로 갈아끼운다).
 *
 * 🔴 모듈 1 의 금기 (설계 [[시간표 짜기 v2 설계]] 「나중에 갈아끼울 데」):
 *   · 칸은 「글자 한 줄」이 아니라 「값 하나」 — CellValue 는 태그 붙은 합집합이다.
 *   · 표의 주인(ownerRef) 은 늘 비어 있고 화면은 이 칸을 안 본다 (다음 모듈이 쓴다).
 *   · 격자의 행·열이 무엇인지는 표(틀)에서 받는다 — 요일·교시를 코드에 박지 않는다.
 *   · 시간 틀은 v1 TimetableSpec 모양 그대로, 표가 「값으로」 통째로 보유한다.
 */
import type { TimetableSpec } from '../types/schema';

/** v2 파일의 스키마 판 번호 (v1 은 2·3) */
export const V2_SCHEMA_VERSION = 4 as const;

/**
 * CellValue — 칸이 담는 「값 하나」.
 * 🔴 지금은 글자뿐이다. 나중에 { kind: 'ref', agentId?, activityId?, … } 가 붙는다.
 *    그래서 「글자 한 줄」이 아니라 태그 붙은 합집합으로 둔다 — 갈아끼울 자리다.
 */
export type CellValue =
    | { kind: 'text'; text: string };

/**
 * OwnerRef — 표의 「주인」. 모듈 1 에선 늘 비어 있고 화면이 이 칸을 안 본다.
 *   나중에 반·교사·특별실을 가리키게 된다(그래야 자동 배정 모듈이 붙는다).
 */
export interface OwnerRef {
    kind: 'track' | 'agent' | 'resource';
    id: string;
}

/**
 * Sheet — 표 하나 = 「주인 없는 이름 있는 주간 격자」.
 *   spec   시간 틀을 「값으로」 통째로 보유 (v1 TimetableSpec 모양 그대로).
 *          공유 관계(여러 표가 한 틀을)는 나중 「틀 공유」 모듈이 되살린다.
 *   cells  칸 내용. 키는 cellKey(colKey, rowKey) — 빈 칸은 담지 않는다.
 *   owner  주인(비어 있음). 화면은 이 칸을 안 본다.
 */
export interface Sheet {
    id: string;
    name: string;
    spec: TimetableSpec;
    cells: Record<string, CellValue>;
    owner?: OwnerRef;
    attr?: Record<string, unknown>;
}

/**
 * Project — 파일 한 장. 프로젝트(학교·학기) 하나 + 그 밑의 표들.
 *   sheets  탐색기에 파일처럼 줄 서는 표들.
 *   trash   지운 표(탐색기 휴지통). 되살릴 수 있다 — 묻지 않고 영구 삭제하지 않는다.
 *   legacy  🔴 v1 파일을 열었을 때 「손대지 않고 통째로 보관」한 원본 전부.
 *           모르는 모양이 나와도 버리지 않는다(v1 migrateDoc 의 「빈 배열」 버릇 금지).
 *           새 파일이면 null.
 */
export interface Project {
    schemaVersion: typeof V2_SCHEMA_VERSION;
    name: string;
    term: string;
    sheets: Sheet[];
    trash: Sheet[];
    legacy: LegacyDoc | null;
    updatedAt?: string;
}

/** v1 파일 원본(통째 보관). 모양을 모르므로 자유 레코드로 들고 다닌다 — 버리지 않는 것이 핵심. */
export type LegacyDoc = Record<string, unknown>;

/** 한 칸을 가리키는 키 — 열 키와 행 키의 조합. 격자는 이 키만 알면 된다(요일·교시를 모른다). */
export function cellKey(colKey: string, rowKey: string): string {
    return `${colKey}:${rowKey}`;
}

/** 칸의 글자 읽기 — 없으면 빈 문자열. CellValue 가 글자 아닌 값으로 커지면 여기만 고친다. */
export function cellTextOf(v: CellValue | undefined): string {
    if (!v) return '';
    return v.kind === 'text' ? v.text : '';
}
