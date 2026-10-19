/**
 * ══════════════════════════════════════════════════════════════
 *  v2 저장 모델 — 「표가 먼저, 뜻은 컴포넌트로」 (schemaVersion: 5)
 * ══════════════════════════════════════════════════════════════
 *
 * 모듈 1·1.1 은 「속성 패널이 규칙으로 표를 만드는」 길이었다 — 쥔님 판정으로 뒤집혔다:
 * *"도메인 변수에서 기인해서 표가 만들어지는게 아니라, 표는 수동으로 엑셀처럼 자유롭게 만들 수 있고,
 *   도구 블록 같은 걸 넣어서 자동화하는 걸로"* · *"유니티의 컴포넌트처럼 끼우면 (…) 속성을 매만지고
 *   적용을 하면 적용이 되는 거지"*
 *
 * ── 뼈대 ──────────────────────────────────────────────────────
 *   Project  파일 한 장 = 프로젝트(학교·학기) 하나. 그 밑에 표(Sheet)들이 산다.
 *   Sheet    「주인 없는 이름 있는 자유 격자」 하나 — 줄(Row)·열(Col)·칸(cells)을 직접 들고 있다.
 *   Row      줄 하나. 시각은 안 갖는다 — 시작 시각 + 누적(분+틈)으로 파생한다(rows.ts).
 *   Col      열 하나. 「한 열 = 무조건 하루」 — 주기(요일·N일차)는 열 개수와 머리 글자일 뿐이다.
 *   Component 표에 꽂는 「도구」 — 꽂고 속성을 만지고 「적용」을 눌러야만 표(rows/cols)가 바뀐다.
 *             표를 쓰지 소유하지 않는다 — 빼도 이미 바뀐 표는 그대로 남는다.
 *
 * 🔴 「교시」 낱말은 이 파일을 포함해 코드·화면 어디에도 안 쓴다 — 「줄」·「열」이다.
 */
/** v2 파일의 스키마 판 번호 — 모듈 2 에서 4 → 5 (rows/cols 모델로 뼈대가 바뀌었다) */
export const V2_SCHEMA_VERSION = 5 as const;

/**
 * CellValue — 칸이 담는 「값 하나」.
 * 🔴 지금은 글자뿐이다. 나중에 { kind: 'ref', agentId?, activityId?, … } 가 붙는다.
 *    그래서 「글자 한 줄」이 아니라 태그 붙은 합집합으로 둔다 — 갈아끼울 자리다.
 */
export type CellValue =
    | { kind: 'text'; text: string };

/**
 * OwnerRef — 표의 「주인」. 지금은 늘 비어 있고 화면이 이 칸을 안 본다.
 *   나중에 반·교사·특별실을 가리키게 된다(그래야 자동 배정 모듈이 붙는다).
 */
export interface OwnerRef {
    kind: 'track' | 'agent' | 'resource';
    id: string;
}

/** 한 줄의 길이를 재는 최소 단위(분) — 행 경계 끌기의 스냅 단위이자 최소 길이 */
export const ROW_SNAP_MINUTES = 5;
export const MIN_ROW_MINUTES = 5;

/**
 * Row — 표의 한 줄.
 *   key        격자가 아는 전부. 칸은 (colKey, rowKey) 로만 찾는다 — 요일·교시를 코드에 안 박는다.
 *   label      비어 있으면 자동 번호(수업 있는 줄만 센다). 글자를 쓰면 그 글자로 덮는다("점심" 등).
 *   minutes    이 줄의 길이(분) — 행 높이가 여기 비례한다. 행 경계를 끌면 이 값이 바뀐다.
 *   gapAfter   이 줄 다음에 오는 빈 틈(분) — 쉬는 시간. 행이 아니라 행 사이의 얇은 틈으로 그린다.
 *   assignable 수업을 넣을 수 있는 칸인지(점심·쉬는 시간으로 끈 줄이면 false).
 */
export interface Row {
    key: string;
    label?: string;
    minutes: number;
    gapAfter: number;
    assignable: boolean;
}

/** Col — 표의 한 열. 「한 열 = 무조건 하루」 — 요일·N일차는 라벨일 뿐이다 */
export interface Col {
    key: string;
    label: string;
}

/**
 * ComponentInstance — 표에 꽂힌 컴포넌트 하나(스탬프).
 *   componentId  어느 종류인지(레지스트리 키 — 예: 'school-periods')
 *   instanceId   이 인스턴스의 고유 id(같은 종류를 여러 번 꽂을 수 있다)
 *   props        마지막으로 만진 속성값 — 「적용」을 눌러야만 표에 반영된다. 다시 열어도 이 값이 보인다.
 */
export interface ComponentInstance {
    componentId: string;
    instanceId: string;
    props: Record<string, unknown>;
}

/**
 * Sheet — 표 하나.
 *   startTime   표 전체의 시작 시각("HH:mm") — 시간축의 유일한 기준점. 나머지는 전부 파생이다.
 *   rows/cols   자유 격자 — 줄·열을 몇 개든, 어떤 길이로든 가질 수 있다.
 *   cells       칸 내용. 키는 cellKey(colKey, rowKey) — 빈 칸은 담지 않는다.
 *   components  꽂힌 컴포넌트들의 속성값 — 적용 전까지는 표에 영향이 없다.
 *   owner       주인(비어 있음). 화면은 이 칸을 안 본다.
 */
export interface Sheet {
    id: string;
    name: string;
    startTime: string;
    rows: Row[];
    cols: Col[];
    cells: Record<string, CellValue>;
    components: ComponentInstance[];
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
