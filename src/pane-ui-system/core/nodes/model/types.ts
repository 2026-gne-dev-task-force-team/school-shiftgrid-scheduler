/**
 * 노드 타입 등록소 — 플러그인이 「나는 이런 노드를 만든다」고 꽂는 표(설계 「노드 타입 규격」).
 *
 * ⭐ 이 플러그인은 「무엇」을 모르고 「역할」만 안다 — 탐색기는 이 표만 읽는다(시간표·교사라는 낱말은 여기 없다).
 *    N1 에서 실제로 쓰는 칸은 label·icon·container·can 넷 · 나머지(openable·open·derive·create·menu)는
 *    규격만 세워 둔 자리다(설계: *"나머지는 자리만"* — N4 에서 소비 플러그인이 채운다).
 *
 * 🔴 모듈 전역 Map 이다(등록은 본래 부수효과 — view-registry 와 같은 결). registerType 은 Disposable 을 돌려준다:
 *    그 타입을 등록한 플러그인이 꺼지면 아이콘·열기·메뉴만 빠지고 노드는 남는다(모르는 타입 = 회색 글자 + file 아이콘).
 */
import type { IconName } from '../../../plugin';
import type { MenuEntry, Disposable } from '../../../plugin';
import type { Node } from './tree';

// 🔴 노드 타입 규격(VirtualNode·CreateSpec·NodeTypeDef)은 약속(이 꾸러미 contracts/nodes)이 쥔다 — 제공자가 import 해 구현한다(3판 부채 끊기).
//    ⭐ 재export 는 이 폴더가 `./types` 로 받던 길을 안 깨려는 것뿐(derive·index·api 가 그대로 쓴다). NodeTypeDef 만 이 파일 런타임이 쓴다.
import type { NodeTypeDef } from '../contracts/nodes';
export type { VirtualNode, CreateSpec, NodeTypeDef, CanFlags } from '../contracts/nodes';

const registry = new Map<string, NodeTypeDef>();

/**
 * 🔴 등록/해제 알림 — index.ts 가 「create 있는 타입마다 new-<type> 명령」을 자동으로 켜고 끈다(N4 반쪽 메꿈).
 *   create 가 있는 타입이 등록되면 register, 그 등록이 거둬지면 unregister. create 없는 타입(일정 record 등)은 안 알린다.
 */
export type TypeRegEvent =
    | { kind: 'register'; type: string; def: NodeTypeDef }
    | { kind: 'unregister'; type: string };

const typeListeners = new Set<(ev: TypeRegEvent) => void>();

/** 등록/해제를 받는 구독 — 돌려주는 Disposable 로 해지(index.ts 가 활성 동안 쥔다). */
export function onTypeRegistered(fn: (ev: TypeRegEvent) => void): Disposable {
    typeListeners.add(fn);
    return { dispose() { typeListeners.delete(fn); } };
}

function notifyTypes(ev: TypeRegEvent): void {
    for (const fn of typeListeners) { try { fn(ev); } catch { /* 하나가 던져도 나머지 */ } }
}

/** create 가 있는(= 「새로 만들기」 후보가 되는) 타입들 — 명령 자동 등록이 「활성 전 등록분」을 한 번 돌 때 쓴다. */
export function createTypes(): NodeTypeDef[] {
    return [...registry.values()].filter((d) => d.create);
}

/** 타입을 꽂는다 — 같은 type 재등록은 덮어쓴다. dispose 는 「그 등록이 아직 그대로일 때만」 거둔다. */
export function registerType(def: NodeTypeDef): Disposable {
    registry.set(def.type, def);
    if (def.create) notifyTypes({ kind: 'register', type: def.type, def });
    return {
        dispose() {
            if (registry.get(def.type) === def) {
                registry.delete(def.type);
                if (def.create) notifyTypes({ kind: 'unregister', type: def.type });
            }
        },
    };
}

export function getType(type: string): NodeTypeDef | undefined {
    return registry.get(type);
}

/** 컨테이너(폴더 역할)인가 — 모르는 타입은 컨테이너 아님(파일처럼 그린다). */
export function isContainerType(type: string): boolean {
    return !!registry.get(type)?.container;
}

/** 레코드성 타입인가 — 탐색기가 「어떤 경우에도 안 보일 노드」를 가릴 때 flatten·buildMainRows 에 콜백으로 준다. */
export function isRecordType(type: string): boolean {
    return registry.get(type)?.record === true;
}

/** 이 노드에 그릴 아이콘 — 등록 안 된 타입은 'file'(회색 글자로 그리는 건 뷰 몫). */
export function iconOf(node: Node): IconName {
    const def = registry.get(node.type);
    if (!def) return 'file';
    return typeof def.icon === 'function' ? def.icon(node) : def.icon;
}

/** 이 노드의 사용자 이모지 — 있으면 뷰가 iconOf 대신 그린다(빈 문자열은 없음으로). */
export function emojiOf(node: Node): string | undefined {
    return node.icon || undefined;
}

/** 「새로 만들기」 줄에 그릴 아이콘 — 그 타입 자신의 아이콘(어느 것을 만드는지 한눈에).
 *  노드를 봐야 정해지는 함수 아이콘은 아직 노드가 없으니 'plus' 로 둔다. */
export function createIconOf(def: NodeTypeDef): IconName {
    return typeof def.icon === 'function' ? 'plus' : def.icon;
}

/** 등록된 타입인가 — 뷰가 「모르는 타입(회색 글자)」을 가릴 때 쓴다. */
export function isKnownType(type: string): boolean {
    return registry.has(type);
}

/**
 * 이 부모 타입이 이 자식 타입을 받나 — 드래그·이동의 accepts 판정 한 곳(model/tree.move 에 주입된다).
 *   - 컨테이너가 아니면 안 받는다 · container === true 면 전부 · { accepts } 면 그 목록만.
 *   🔴 모르는 타입(등록 안 됨)은 컨테이너가 아니라고 본다 — 자식을 못 받는다.
 */
export function acceptsChild(parentType: string, childType: string): boolean {
    const c = registry.get(parentType)?.container;
    if (!c) return false;
    if (c === true) return true;
    return c.accepts.includes(childType);
}

/**
 * 우클릭 「새로 만들기 ▸」 후보 — 설계 그대로 표를 돈다(⛔ 타입 이름 비교 없음):
 *   부모 타입이 받는 것(accepts) ∩ 그 타입이 create.under 로 허용하는 부모. create 없는 타입은 후보 아님.
 *   🔴 지금은 「폴더」 하나뿐이지만 코드는 등록 표 전체를 돈다 — N4 에서 타입이 늘면 저절로 채워진다.
 */
export function createCandidates(parentType: string): NodeTypeDef[] {
    const out: NodeTypeDef[] = [];
    for (const def of registry.values()) {
        if (!def.create) continue;
        if (def.record) continue;                                   // 🔴 레코드성(일정 등)은 탐색기로 못 만든다 — 보이지도 않는 걸 만들면 이름칸이 허공에 뜬다
        if (!acceptsChild(parentType, def.type)) continue;          // 부모가 이 타입을 받나
        const under = def.create.under;
        if (under && !under.includes(parentType)) continue;         // 이 타입이 이 부모 밑을 허용하나
        out.push(def);
    }
    return out;
}

/** 그 타입이 꽂은 줄 메뉴 항목(menu?(nodeId)) — 없으면 빈 배열. 뷰가 구분선 뒤에 붙인다. */
export function typeMenu(node: Node, nodeId: string): MenuEntry[] {
    return typeMenuByType(node.type, nodeId);
}

/** 타입 이름으로 줄 메뉴 항목 — 유도(가상) 줄은 Node 가 없으니 type 문자열로 묻는다. */
export function typeMenuByType(type: string, nodeId: string): MenuEntry[] {
    const fn = registry.get(type)?.menu;
    if (!fn) return [];
    try { return fn(nodeId); } catch { return []; }
}

/** 그 타입이 열 수 있나 + open 핸들러가 있나 — 유도 줄 열기 판정. */
export function canOpenType(type: string): boolean {
    const def = registry.get(type);
    return !!def?.openable && typeof def.open === 'function';
}

/**
 * 한 번 누르기(click)·Enter·키보드 ↑↓(arrow)가 이 타입에 할 일 — 한 곳에서 가른다(옵시디언식 · 쥔님 2026-11-02:
 *   *"파일 선택 방법 그냥 다시 옵시디언으로 가야겠다"* — 11-01 의 VS Code 식(한 번=고르기, 두 번=열기)을 뒤집었다).
 *   🔴 openable 이 컨테이너를 **이긴다**: 달력 저장소처럼 「폴더+파일」인 타입은 한 번 누르기·Enter = 열기(펴기는 ▸ 화살표가 쥔다).
 *   컨테이너이기만 하면(openable 아님) — 한 번 누르기·Enter 는 펴기/접기(toggle).
 *   둘 다 아니면(파일 역할이거나 모르는 타입) 열기 — openById 가 openable 아니면 조용히 아무 일도 안 한다.
 *   🔴 arrow(↑↓)는 늘 none — 고르기만 하고 열지도 펴지도 않는다(옵시디언도 그렇다).
 */
export function activateVerb(type: string, via: 'click' | 'enter' | 'arrow'): 'open' | 'toggle' | 'none' {
    if (via === 'arrow') return 'none';
    if (canOpenType(type)) return 'open';
    if (isContainerType(type)) return 'toggle';
    return 'open';
}

/** 그 타입의 open 을 실행(없으면 아무 일 없음) — 유도 줄·실노드 공통 열기 경로. */
export function openType(type: string, nodeId: string): void {
    const def = registry.get(type);
    if (def?.openable && def.open) def.open(nodeId);
}

/**
 * 이 타입의 싱글톤 규칙 — 'tree'(나무에 하나)·'parent'(부모마다 하나)·없음. 🔴 model/tree 의 유일성 관문(violatesUnique)에
 *   주입한다(모델은 등록 표를 모르니 바깥이 준다 — acceptsChild 와 같은 결). 모르는 타입은 제한 없음.
 */
export function uniqueOf(type: string): 'tree' | 'parent' | undefined {
    return registry.get(type)?.unique;
}

/** 이 타입을 만들 때 같이 만들 슬롯 자식 타입들(자동 슬롯) — 없으면 빈 배열. store 가 한 묶음으로 만든다. */
export function slotsOf(type: string): string[] {
    return registry.get(type)?.slots ?? [];
}

/**
 * can.rename/move/delete — 기본 전부 true(타입이 명시로 끌 때만 false). 🔴 관문 한 곳:
 *   메뉴 회색·드래그·모델 move/remove/rename·공개 API 가 전부 이걸 지난다(violatesUnique·acceptsChild 와 같은 결).
 *   can 은 고정 객체일 수도, 함수 `(nodeId) => CanFlags` 일 수도 있다 — 함수면 그 노드·현재 상황으로 답한다(모르는 타입은 전부 허용).
 */
export function canDo(type: string, nodeId: string, what: 'rename' | 'move' | 'delete'): boolean {
    // 🔴 싱글톤(나무에 하나 · unique:'tree')은 탐색기에서 지우기를 아예 막는다 — 막아도 실수로 지우는 일이 잦았다(쥔님 2026-11-09).
    //    맨 위 고정 구역에 따로 뜬다(ExplorerView). 옮기기는 「제 부모 안 순서 바꾸기」만 — tree.move 가 다른 부모행을 막는다.
    //    🔴 단 타입 can 이 delete:true 를 「명시」하면 그걸 따른다 — 계정 루트(마스터만 · confirmDelete 경고)가 막혀 못 지웠다(Q5-C 쥔님 2026-11-10 「삭제 안됨 · 버그」).
    const can = registry.get(type)?.can;
    const flags = can == null ? undefined : typeof can === 'function' ? can(nodeId) : can;
    if (what === 'delete' && registry.get(type)?.unique === 'tree') return flags?.delete === true;
    return flags?.[what] !== false;
}

/**
 * 이 타입을 parentId 아래 새로 만들어도 되나 — 기본 true(canCreate 가 없으면). 🔴 관문 한 곳:
 *   우클릭 메뉴 회색·헤더 단추·공개 API create 가 전부 지난다. parentId 가 null 이면 부모 미정 자리(헤더 단추 등).
 */
export function canCreateType(type: string, parentId: string | null): boolean {
    const fn = registry.get(type)?.canCreate;
    return fn ? fn(parentId) : true;
}

/**
 * 이 노드를 지우기 전에 보일 경고 문구 — 없으면 null(바로 휴지통으로). 고정 문자열이거나 `(nodeId) => string | null` 함수.
 *   🔴 window.confirm 이 아니라 탐색기가 인라인 확인 줄로 띄운다(볼트 규칙).
 */
export function confirmDeleteMsg(type: string, nodeId: string): string | null {
    const cd = registry.get(type)?.confirmDelete;
    if (cd == null) return null;
    return typeof cd === 'function' ? cd(nodeId) : cd;
}

/**
 * 이 노드를 지금 숨길까 — record(무조건 숨김)와 달리 상황(권한 등)에 따라 그때그때. 없으면 늘 보인다.
 *   🔴 탐색기는 record(무조건) 와 hidden(조건) 을 합쳐 「이 노드를 건너뛸까」로 쓴다(nodeHidden).
 */
export function isHiddenNode(node: Node): boolean {
    return registry.get(node.type)?.hidden?.(node.id) === true;
}

/** 탐색기가 「이 노드(와 그 아래)를 통째로 건너뛸까」 — 무조건 숨김(record) 또는 조건부 숨김(hidden). flatten·buildMainRows 에 콜백으로 준다. */
export function nodeHidden(node: Node): boolean {
    const def = registry.get(node.type);
    if (!def) return false;
    if (def.record === true) return true;
    return def.hidden?.(node.id) === true;
}

/** 테스트·앱 재마운트에서 목록을 비운다(view-registry.clearViews 와 같은 결). 알림 구독도 같이 끊는다. */
export function clearTypes(): void {
    registry.clear();
    typeListeners.clear();
}
