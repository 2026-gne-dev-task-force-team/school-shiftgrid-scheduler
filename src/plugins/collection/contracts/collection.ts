/**
 * 🔴 약속 「collection」 0.2 — 노션 데이터베이스를 본뜬 「도메인을 모르는 목록 화면」의 규격(타입만).
 *   제공자: collection 꾸러미(provides: collection · 모듈 값 recordViewApi). 손님은 host.modules 로
 *   collection 모듈(RecordViewApi)을 받아 RecordView 컴포넌트·칸 타입 레지스트리·순수 변환(schema)을 쓴다.
 *   ⛔ 손님은 꾸러미 속 파일을 직접 import 안 한다 — 타입은 이 contracts 파일에서 import type, 값은 host.modules.use<RecordViewApi>('collection') 로.
 *
 * 🔴 ⛔ 도메인을 한 글자도 모른다. 쓰는 쪽이 「칸 정의 + 행 + 콜백」만 넘기면 목록 화면을 공짜로 얻는다.
 *
 * ⭐ 「제어형(controlled)」이다 — 셀을 고치면 onCellChange 로 바깥에 알리고, 바깥이 records 를 바꿔 되돌려 준다.
 *   보기 정의(필터·정렬·칸 순서·폭·숨김)는 바깥이 저장하거나(views/onViewsChange) 안 주면 localStorage(viewKey)에 둔다.
 *
 * 📌 0.1 → 0.2(손님 0 이라 깰 수 있는 마지막 기회였다): FieldType 닫힌 유니온 → string(칸 타입 레지스트리) · RecordField.config ·
 *   RecordViewState → ViewDef 로 흡수(검색어만 잠시 상태) · props views·onViewsChange·onPaste·onConvertField·titleKey 추가 ·
 *   모듈 표면에 fieldTypes·schema 추가 · version 2.
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { Disposable, IconName, PluginHost, PeekHandle, PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import type { NodesApi } from '../../explorer/contracts/nodes';

/** 내장 칸 종류 — 여섯. 🔴 칸 type 자체는 string(꽂힌 타입은 `<pluginId>.<name>`)이고 이 이름들은 내장 등록의 키일 뿐이다. */
export type BuiltinFieldType = 'text' | 'number' | 'select' | 'multi' | 'date' | 'check';
/** 칸 종류 이름 — 레지스트리의 키. */
export type FieldType = string;

/** select·multi 가 고를 수 있는 값 하나. color 는 알약 색 이름(colors.ts 의 PILL_COLORS). */
export interface FieldOption {
    /** 🔴 안정 값 — 행에 저장되는 것. 이름(label)을 바꿔도 값은 그대로다 */
    value: string;
    label: string;
    /** 알약 색 이름(gray·blue·green…). 없으면 gray */
    color?: string;
}

/** 한 칸의 정의. */
export interface RecordField {
    /** 🔴 안정 id — 'f_' + uid. 화면 어디서도 label 을 키로 안 쓴다 */
    key: string;
    label: string;
    type: FieldType;
    /** 타입별 설정(그 타입 정의가 해석한다) */
    config?: unknown;
    /** select·multi 전용 — 고를 수 있는 값 목록 */
    options?: FieldOption[];
    /** 기본 칸 폭(px). 보기 정의의 columns[].width 가 덮을 수 있다 */
    width?: number;
    /** 참이면 이 칸은 못 고친다(표시만) */
    readOnly?: boolean;
    /** 참이면 「기본 칸」 — 지우기·타입 바꾸기 금지(이름표는 바꿀 수 있다). 제목 칸(titleKey)도 같은 취급 */
    locked?: boolean;
    /** 참이면 「유일」 — 같은 칸에 같은 값(앞뒤 공백·대소문자 무시)이 두 줄에 못 들어간다. 빈 값은 겹침으로 안 센다(Q11 W10) */
    unique?: boolean;
    /** 칸 아이콘(이모지 한 글자) — 없으면 타입 아이콘. 칸 머리 메뉴에서 고르고 속성 줄도 같이 쓴다 */
    icon?: string;
    /** 칸 설명 — 칸 머리·속성 줄 이름표에 올리면 툴팁으로 뜬다(기본 칸은 `defineCollection` 이 채운다) */
    description?: string;
}

/** 날짜 값 — P2 에서 string 에서 올라온다. time 이면 start 에 `…THH:MM`, range 면 end 가 붙는다. */
export interface DateValue {
    start: string;
    end?: string;
}

/** 셀 하나가 가질 수 있는 값 — 종류별로 다르다. text/select=string · number/id=number · check=boolean · multi·relation=string[] · date={start,end?}. */
export type RecordCellValue = string | number | boolean | string[] | DateValue | null;

/** 필터 연산자 id — 칸 종류마다 쓸 수 있는 집합이 다르다(FieldTypeDef.ops). 내장: contains·eq·gt·before·has·empty·isTrue… */
export type FilterOp = string;

/** 필터 한 줄 — 「이 칸이, 이 연산자로, 이 값과」. */
export interface FilterRule {
    key: string;
    op: FilterOp;
    /** empty·notEmpty·isTrue·isFalse 는 값이 없다 */
    value?: string | number;
}

/** 필터 — 규칙 하나 또는 and/or 묶음. 🔴 2단까지(노션 API 와 같다). 3단째는 정규화가 버린다. */
export type FilterNode = FilterRule | { and: FilterNode[] } | { or: FilterNode[] };

/** 정렬 한 줄 — 「이 칸을 오름/내림」. 여러 줄은 앞선 것이 먼저다(안정 정렬). */
export interface SortRule {
    key: string;
    dir: 'asc' | 'desc';
}

/** 보기 종류 — P1 은 표 하나. 🔑 보드·목록·갤러리를 꽂을 자리(P3~). */
export type RecordViewKind = 'table' | 'board' | 'list' | 'gallery';

/** 보기 안의 칸 한 줄 — 배열 순서 = 칸 순서. */
export interface ViewColumn {
    key: string;
    width?: number;
    hidden?: boolean;
    wrap?: boolean;
}

/** 보기 정의 — 자료가 아니라 자료를 보는 창. 노드에 저장된다(공유·백업 대상). */
export interface ViewDef {
    id: string;
    name: string;
    kind: RecordViewKind;
    filter: FilterNode;
    sorts: SortRule[];
    group?: { key: string; hideEmpty: boolean; order?: string[] };
    columns: ViewColumn[];
    frozen?: number;
    calc?: Record<string, string>;
}

/** 0.1 의 보기 상태(localStorage 옛 꼴) — 정규화가 ViewDef 하나로 올린다. 새 코드는 쓰지 않는다. */
export interface RecordViewState {
    kind: 'table';
    search: string;
    filters: FilterRule[];
    sorts: SortRule[];
    hidden: string[];
    widths: Record<string, number>;
}

// ───────────────────────── 칸 타입 확장 지점 ─────────────────────────

/** 셀 컴포넌트가 받는 것 — 표시+편집. 🔴 값 import 금지라 컴포넌트는 모듈 값으로 건넨다. */
export interface FieldCellProps {
    field: RecordField;
    value: RecordCellValue | undefined;
    config: unknown;
    editable: boolean;
    onChange: (v: RecordCellValue) => void;
    /** 행 전체(다른 칸을 읽고 싶은 타입용) */
    row: unknown;
    /** 선택지를 화면에서 고치는 칸(select·multi)만 쓴다 — 안 주면 선택지 편집 UI 가 숨는다 */
    onOptionsChange?: (options: FieldOption[]) => void;
}

/** 칸 타입이 정하는 필터 연산자 한 개. */
export interface FilterOpDef {
    id: string;
    label: string;
    needsValue: boolean;
    match(value: RecordCellValue | undefined, arg: string | number | undefined, config: unknown, field: RecordField): boolean;
}

/** 칸 타입 한 벌 — 내장 6종도 같은 꼴로 등록된다. 꽂힌 것은 `<pluginId>.<name>` 접두사 강제. */
export interface FieldTypeDef {
    type: string;
    label: string;
    icon: IconName;
    defaultConfig?: unknown;
    /** 선택지를 갖는 타입(select·multi) — 변환·편집 UI 가 이걸 본다 */
    hasOptions?: boolean;
    /** 칸을 처음 만들 때 넣는 선택지(status 의 기본 세 그룹처럼) — 없으면 빈 목록 */
    defaultOptions?: FieldOption[];
    /** 참이면 이 타입 칸은 값을 못 고친다(created·updated·id — 자동 계산 칸) */
    readOnly?: boolean;
    /** 필터 값 입력칸 종류 */
    filterInput?: 'text' | 'number' | 'date' | 'option';
    Cell: ComponentType<FieldCellProps>;
    /** 이 값이 「비었다」인가 — 없으면 null·''·[]·NaN 이 빈 값 */
    isEmpty?(value: RecordCellValue | undefined, config: unknown): boolean;
    /** 검색·정렬·복사·변환이 쓰는 글자 */
    toText(value: RecordCellValue | undefined, config: unknown, field: RecordField): string;
    /** 붙여넣기·변환이 글자에서 값을 만든다 */
    fromText(text: string, config: unknown, field: RecordField): RecordCellValue;
    /** 없으면 toText 비교(빈 값은 늘 끝) */
    compare?(a: RecordCellValue | undefined, b: RecordCellValue | undefined, config: unknown, field: RecordField): number;
    /** 없으면 contains·empty·notEmpty */
    ops?: FilterOpDef[];
    /** 보드·그룹 묶기 키 */
    groupKey?(value: RecordCellValue | undefined, config: unknown): string | null;
    /** 칸 설정 팝오버(P2~) */
    Config?: ComponentType<{ field: RecordField; onChange: (f: RecordField) => void }>;
}

export interface FieldTypeRegistry {
    register(def: FieldTypeDef): Disposable;
    list(): readonly FieldTypeDef[];
    get(type: string): FieldTypeDef | undefined;
}

// ───────────────────────── 노드 얼굴의 자료 꼴 ─────────────────────────

/** 레코드 뷰 노드(`collection.db`)의 data */
export interface DbDoc {
    v: 1;
    /** 스키마. 배열 순서 = 기본 칸 순서 */
    fields: RecordField[];
    /** 제목 칸 key — 지울 수 없고 타입은 text 고정 */
    titleKey: string;
    /** 보기 탭. 최소 1 */
    views: ViewDef[];
    /** ID 칸 자동 번호의 다음 값(P2) */
    seq: number;
}

/** 행 노드(`collection.row`)의 data */
export interface RowDoc {
    v: 1;
    values: Record<string, RecordCellValue>;
    created: string;
    updated: string;
    /** ID 칸 자동 번호 — 행을 만들 때 DbDoc.seq 에서 한 번 받고 불변(삭제돼도 안 되돌림) */
    seq?: number;
    /** 하위 항목을 접었나(자손 숨김). 노드 collapsed 는 탐색기 전용이라 레코드성 행은 여기 둔다. */
    collapsed?: boolean;
}

/** 타입 변환 계획 — 순수 계산 결과. 깎이는 행이 있으면(lost>0) 화면이 확인을 받고 나서 적용한다. */
export interface ConvertPlan {
    key: string;
    /** 변환 뒤의 칸 정의(선택지가 늘 수 있다) */
    field: RecordField;
    /** 값이 바뀌는 행만 */
    changes: { id: string; value: RecordCellValue }[];
    /** 값이 깎이는(정보가 사라지는) 행 수 */
    lost: number;
}

/** 붙여넣기 결과 — 화면이 TSV 를 파싱해 넘긴다. cells[r][c] 는 보이는 칸 순서(c)의 글자. */
export interface PasteRequest {
    /** 붙여넣기 칸 순서에 대응하는 보이는 칸 key (칸 수보다 열이 많으면 모자란 만큼 null) */
    keys: (string | null)[];
    rows: string[][];
}

/**
 * 하위 항목(행 밑에 행 · 노션 sub-items) — 넘기면 「수동 순서」일 때 트리로 그린다(들여쓰기·접기·Tab/단추로 들여·내어쓰기).
 *   🔴 정렬·필터·검색이 하나라도 걸리면 평평해진다(노션과 같다). 저장은 손님 몫 — 노드 얼굴은 nodes.ts 가 채운다.
 *   ⭐ 방 목록의 「방 안에 방」(indent·onIndentRow·onOutdentRow)이 이 꼴로 제어형 레코드 뷰에 갈아탄다.
 */
export interface RecordTree<T> {
    /** 이 행의 부모 행 id(뿌리면 null). records 는 트리 순서가 아니어도 된다 — 내부에서 편다. */
    parentOf: (r: T) => string | null;
    /** 이 행이 접혀 자손을 숨기고 있나 */
    collapsed: (id: string) => boolean;
    onToggleCollapse: (id: string) => void;
    /** 들여쓰기 — 바로 위 형제의 마지막 자식으로. 첫 형제는 아무 일 없음(막는다). */
    onIndent: (id: string) => void;
    /** 내어쓰기 — 부모의 바로 다음 형제로. 뿌리는 아무 일 없음(막는다). */
    onOutdent: (id: string) => void;
    /** 이 행 밑에 새 하위 행을 만든다 — 행 hover 의 「하위 항목 추가」. 없으면 단추를 안 그린다 */
    onAddChild?: (id: string) => void;
    /** 행을 다른 행 **위로 끌어 놓으면** 그 행의 하위로(Q8 · 노션 꼴 — 행 가운데 = 하위, 위·아래 가장자리 = 순서). 없으면 끌어서 하위로 못 넣는다 */
    onMoveUnder?: (id: string, parentId: string) => void;
}

/** 셀 하나의 바뀐 값 — onCellsChange 묶음의 한 줄 */
export interface CellChange {
    id: string;
    key: string;
    value: RecordCellValue;
}

/**
 * 레코드 뷰 props — 제어형. 데이터는 바깥 소유, 보기 정의는 바깥(views)이거나 안 주면 localStorage.
 *   T 는 행 하나의 타입(객체). 셀 값은 (행)[field.key] 로 읽는다 — getId 로만 신원을 받는다.
 */
export interface RecordViewProps<T> {
    fields: RecordField[];
    records: T[];
    getId: (r: T) => string;
    /** 보기 정의 저장 키(localStorage) — views 를 안 넘길 때만 쓴다. 모듈마다 고유하게. */
    viewKey: string;
    /** 제목 칸 key — 그 칸은 지울 수 없고 타입이 text 로 고정된다 */
    titleKey?: string;
    /** 보기 정의 — 넘기면 손님이 저장한다(안 넘기면 viewKey 로 localStorage) */
    views?: ViewDef[];
    /** 활성 보기 id — 안 주면 첫 보기 */
    activeView?: string;
    onViewsChange?: (views: ViewDef[]) => void;
    /** 셀을 고치면 부른다. 안 넘기면 모든 칸이 읽기 전용이 된다. */
    onCellChange?: (id: string, key: string, value: RecordCellValue) => void;
    /** 여러 셀을 한 번에(채우기 ⌘D·일괄 편집) — 한 묶음으로 저장하면 되돌리기 한 칸. 안 넘기면 onCellChange 를 셀마다 부른다. */
    onCellsChange?: (changes: CellChange[]) => void;
    /** 「+ 새로 만들기」 줄을 누르면. 안 넘기면 그 줄이 안 뜬다. */
    onAddRecord?: () => void;
    /** 고른 행들을 지우라고 부른다(일괄 삭제 막대). 안 넘기면 선택·삭제 UI 가 안 뜬다. */
    onDeleteRecords?: (ids: string[]) => void;
    /** 행의 「열기」 단추(제목 칸 hover)를 누르면. 안 넘기면 그 단추가 안 뜬다. */
    onOpenRecord?: (id: string) => void;
    /** 넘기면 제목 칸 앞에 행 아이콘이 뜬다(없는 행은 기본 문서 아이콘) — 레코드 = 페이지. */
    iconOf?: (id: string) => string | undefined;
    /** 넘기면 칸 추가·이름·삭제·선택지 편집을 허용한다. 안 넘기면 칸 구조는 고정. */
    onFieldsChange?: (fields: RecordField[]) => void;
    /** 타입 변환 — 값이 함께 바뀌니 칸+값을 한 묶음으로 받는다(깎임 확인은 화면이 이미 받았다). 안 넘기면 onFieldsChange + onCellChange 로 흉내 낸다. */
    onConvertField?: (plan: ConvertPlan) => void;
    /** 표에서 붙여넣으면 부른다(엑셀 TSV). 안 넘기면 붙여넣기를 안 가로챈다. */
    onPaste?: (req: PasteRequest) => void;
    /** 수동 순서 — 정렬이 하나도 없을 때만 행 손잡이가 뜬다. id 를 beforeId 바로 앞으로(맨 끝이면 beforeId=null). */
    onReorder?: (id: string, beforeId: string | null) => void;
    /** 하위 항목(행 밑에 행) — 넘기면 「수동 순서」일 때 트리로 그린다. 안 넘기면 평평한 표. */
    tree?: RecordTree<T>;
    /** 🔑 정리 막대(검색·필터·정렬·칸)를 꽂을 자리 — Frame 의 toolbar 자리 div(머리 아래 · 본문 스크롤 밖).
     *  안 주면(undefined) 보기 맨 위에 제자리로 그린다 · null 이면 자리가 아직 안 생긴 것(아무것도 안 그린다). */
    toolbarHost?: HTMLElement | null;
    className?: string;
}

/** 모듈 표면의 순수 변환 모음 — 손님이 값 import 없이 쓰는 길. */
export interface RecordSchemaApi {
    /** 칸 타입 변환 계획 — 값을 안 바꾸고 계산만 */
    planConvert(
        rows: readonly { id: string; value: RecordCellValue | undefined }[],
        field: RecordField,
        toType: string,
    ): ConvertPlan;
    /** 관계 칸 값 정규화 → 노드 id 배열(many=false 면 최대 하나) */
    normalizeRelation(value: unknown, many?: boolean): string[];
    /** 관계 칸 값 → 대상 이름을 `, ` 로 이은 글자(모르는 id 는 건너뛴다) */
    relationToText(ids: readonly string[], nameOf: (id: string) => string | undefined): string;
}

/** 속성 목록 props — 이름표 | 그 타입의 Cell 한 줄씩(인스펙터가 쓴다). onChange 가 없으면 보기 전용. */
export interface PropertyListProps {
    fields: RecordField[];
    values: Record<string, RecordCellValue>;
    onChange?: (key: string, v: RecordCellValue) => void;
    onOptionsChange?: (key: string, options: FieldOption[]) => void;
}

/**
 * 레코드 열기 페이지 한 벌(Q5 R5) — 노드 틀(nodes.Frame: 경로·⋯·큰 머리) + 속성 목록 + 본문(page-doc). 컬렉션·달력·계정·레코드 뷰 행이 전부 이것 하나를 쓴다.
 *   id 는 레코드 **노드 id**(머리·본문이 노드의 icon·name·body 를 읽고 쓴다). 칸은 PropertyList 와 같은 모양으로 받는다.
 */
export interface RecordPageProps {
    host: PluginHost;
    id: string;
    fields: RecordField[];
    values: Record<string, RecordCellValue>;
    onChange?: (key: string, v: RecordCellValue) => void;
    onOptionsChange?: (key: string, options: FieldOption[]) => void;
    /** 속성 밑·본문 위에 얹을 것(자격증명 슬롯·받은 권한 설명·동작 줄 …) — 속성이 아니라 이 종류 레코드만의 줄. */
    after?: ReactNode;
    /** 이름을 노드 이름 말고 다른 곳에도 쥐는 손님(레코드 뷰 행의 제목 칸)의 이름 바꾸기 길. */
    onRename?: (name: string) => void;
    /** 본문 저장 길 — 없으면 노드 공통 body 칸(nodes.setBody). */
    onBody?: (body: unknown) => void;
}

/**
 * 🔴 host.modules 로 받는 collection 모듈 — 손님이 쓰는 전부. provides 와 짝(모듈 값 recordViewApi).
 *   host.modules.use<RecordViewApi>('collection') 가 돌려준다.
 */
/**
 * 🔑 컬렉션 설정 — 「목록 노드 + 그 안의 레코드 노드」 한 벌을 만드는 데 필요한 전부(P4a · 각 목록 꾸러미가 이 한 장씩만 쓴다).
 *   특화 기능은 칸 정의(baseFields)와 tree 뿐이다 — 그 밖의 다리·화면·속성 패널은 defineCollection 이 한 벌로 낸다.
 */
export interface CollectionConfig {
    /** 노드 타입 id — 목록(컨테이너) · 항목(레코드). 예: 'people.list' · 'people.person' */
    listType: string;
    itemType: string;
    /** 목록을 열면 여는 화면 viewId(예: 'people.sheet') · 목록 우클릭 「열기」가 부르는 명령 id */
    viewId: string;
    openCommandId: string;
    /** 보기 정의 저장 키(RecordView viewKey) */
    viewKey: string;
    /** 목록 이름표·아이콘 — 시작 화면·우클릭 메뉴·인스펙터 「목록」 칸이 쓴다 */
    listLabel: string;
    listIcon: IconName;
    /** 기본 칸 — 첫 칸이 제목(노드 이름)이다. 전부 locked 로 취급(지우기·타입 바꾸기 금지) */
    baseFields: RecordField[];
    /** 개수 단위(「3개」) · 안내 문구들 */
    unit: string;
    text: { startDescription: string; startHint: string };
    /** 참이면 항목이 같은 목록 안의 다른 항목을 부모로 가진다(항목 안에 항목) — 인스펙터 부모 칸 이름표 */
    tree?: { parentLabel: string };
}

/** 항목 하나 — 제목(노드 이름) + 칸 값들. parentId 는 tree 일 때만. ext 는 위층 꽂는 자리(이 꾸러미는 안 건드린다). */
export interface CollectionItem {
    id: string;
    /** 이 항목이 든 목록 id(노드 부모) */
    listId: string;
    name: string;
    values: Record<string, RecordCellValue>;
    parentId?: string;
    ext?: Record<string, unknown>;
}

/** 컬렉션 한 벌의 손잡이 — defineCollection 이 설정 한 장으로 낸다(저장·휴지통·되돌리기는 노드 시스템이 쥔다). */
export interface CollectionKit {
    config: CollectionConfig;
    // ── 다리 ──
    /** 활성 때 한 번 — NodesApi 를 쥐고 구독한다. 돌려준 Disposable 은 호스트가 회수. */
    init(nodes: NodesApi | null): Disposable | null;
    nodes(): NodesApi | null;
    /** 변경 구독(약속 onChange 뒤) */
    onChange(fn: () => void): Disposable;
    // ── 읽기 ──
    /** 살아 있는(휴지통 아닌) 목록 전부(트리 순서) */
    lists(): { id: string; name: string }[];
    /** 그 목록의 살아 있는 항목들(노드 순서) */
    itemsIn(listId: string): CollectionItem[];
    itemOf(id: string): CollectionItem | undefined;
    inTrash(id: string): boolean;
    // ── 쓰기(전부 NodesApi 로) ──
    createList(): string | null;
    /** 항목 하나 더하기(끝에, 최상위). 제목 칸 값은 노드 이름이 된다. 빈 문자열이면 못 만든 것 */
    addItem(listId: string, values?: Record<string, RecordCellValue>): string;
    /** 칸 하나 쓰기 — 제목 칸은 이름 바꾸기(빈 이름 무시) · 빈 값이면 지운다 · 문자열은 trim */
    setValue(id: string, key: string, value: RecordCellValue): void;
    removeItem(id: string): void;
    moveItem(id: string, listId: string, index?: number): void;
    /** 수동 순서 — id 를 beforeId 바로 앞으로(null 이면 맨 끝). tree 면 beforeId 의 부모로 재부모화. 한 묶음 = 되돌리기 한 칸 */
    reorderItem(id: string, beforeId: string | null): void;
    /** 탭·줄바꿈 텍스트 → 항목 여럿(열 i = baseFields[i] · 첫 칸(제목)이 빈 줄·빈 줄은 무시). 만든 id 들 */
    pasteItems(listId: string, text: string): string[];
    /** 목록의 사용자 칸 정의 읽기·쓰기(목록 노드 data.fields) */
    userFieldsOf(listId: string): RecordField[];
    setUserFields(listId: string, fields: RecordField[]): void;
    // ── tree 일 때만(설정에 tree 가 없으면 아무 일 없음) ──
    setParent(id: string, parentId: string | null): void;
    indent(id: string): void;
    outdent(id: string): void;
    // ── 보고 있는 목록 · 노드 타입 함수 · 화면 ──
    /** 「지금 보고 있는 목록」 — 🔴 저장 안 함(기기에 안 남긴다). 목록을 열면 그 id, 목록으로 돌아가면 null */
    active(): string | null;
    setActive(id: string | null): void;
    /** 목록을 열면 「보고 있는 목록」으로 두고 화면을 연다 */
    open(host: PluginHost, listId: string): void;
    /** 목록 우클릭 메뉴 — 부르는 순간 그 목록을 명령 대상으로 잡는다 */
    menu(listId: string): { label: string; icon: IconName; commandId: string }[];
    /** 우클릭 「열기」 명령 본체 — 메뉴가 가리킨 목록을 연다 */
    openMenuTarget(): void;
    /** 목록 화면(가운데 탭) — 시작 화면 포함 */
    Tab(props: { host?: PluginHost; peek?: PeekHandle; leafId?: string }): ReactElement | null;
    /** 항목 노드의 속성 칸(오른쪽 패널) */
    Props(props: PropertiesPaneProps): ReactElement | null;
}

export interface RecordViewApi {
    version: 2;
    /** 제어형 목록 화면. T 는 행 하나의 타입(객체). */
    RecordView<T>(props: RecordViewProps<T>): ReactElement | null;
    /** 속성 목록 — 레코드 한 줄의 칸들을 표 칸과 같은 Cell 로 세로로 그린다(인스펙터용). */
    PropertyList(props: PropertyListProps): ReactElement | null;
    /** 🔑 레코드 열기 페이지 한 벌 — 노드 틀 + 속성 목록 + 본문. 레코드를 옆으로 열 때 이것만 쓴다(Q5 R5). */
    RecordPage(props: RecordPageProps): ReactElement | null;
    /** 칸 타입 레지스트리 — 내장 여섯이 같은 꼴로 올라 있고 꽂힌 타입은 `<pluginId>.<name>` 접두사 */
    fieldTypes: FieldTypeRegistry;
    schema: RecordSchemaApi;
    /** 🔑 컬렉션 한 벌(목록 노드 + 레코드 노드 + 화면 + 속성 칸) — 설정 한 장으로. 활성 때 만든다(꾸러미 사이 값 import 금지라 모듈로 건넨다). */
    defineCollection(config: CollectionConfig): CollectionKit;
}
