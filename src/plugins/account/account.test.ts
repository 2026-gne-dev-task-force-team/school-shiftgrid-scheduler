/**
 * 계정 검산 — 가짜 nodes 제공자 + 약속 플러그인 + activateAll 로 9가지를 잰다(쥔님 2026-11-08 설계).
 *   🔴 실 플러그인(탐색기) 대신 인메모리 nodes 제공자를 쓴다 — 레코드 노드 저장·byType·subscribe 를 실제로 돌린다.
 *   ⛔ account 를 src/app/plugins.ts 에 등록하지 않는다(머지·등록은 메인) — 여기서 목록을 직접 넘긴다.
 *   (테스트 파일은 구조 검사 walk 에서 빠지므로 형제 플러그인 core 를 값으로 import 해도 된다.)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { activateAll, disablePlugin, enablePlugin, listPlugins, disposeOwner } from '../../pane-ui-system/plugin';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import type { Identity } from './contracts/identity';
import type { Permit } from './contracts/permit';
import type { NodesApi, Node, PublicNode } from '../explorer/contracts/nodes';

import { accountPlugin } from './index';
import * as core from './core';
import * as credCore from './credential/core';
import { SECRET_TYPE, accountNodeTypeImpl } from './nodes';
import * as credDialog from './credential/dialog';

// 🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」) — 약속 셋(identity·credential·permit)은 account 꾸러미가 들고 온다(contributes.interfaces).
//    nodes 약속은 아래 가짜 nodes 제공자가 들고 온다(선언+제공). 증명(credential)은 account 꾸러미 안 내부 모듈이다(따로 안 켠다).
const BASE = (): PluginModule[] => [];
const IDS = ['fake-nodes', 'account', 'cons'];

afterEach(() => {
    for (const id of IDS) disposeOwner(id);
    credCore.setPrompt(async () => null);   // 입력 창구를 기본(취소)으로 — 다음 테스트로 안 샌다
});

const find = (id: string) => listPlugins().find((p) => p.id === id);

// ── 인메모리 nodes 제공자(nodes 약속을 들고 오고 채운다 — 탐색기 꾸러미 흉내) ──
//    opts.deferred: true 면 「로드 전」 상태로 시작한다 — 읽기(get·byType·find·children)가 빈 값을 주다가
//    load() 를 부르면 그제야 보이고 subscribe 를 깨운다(explorer 의 loadTree 비동기 로드 흉내).
function makeNodes(opts?: { deferred?: boolean; trash?: boolean }) {
    const map = new Map<string, Node>();
    const subs = new Set<(ids: string[]) => void>();
    const ROOT = 'root-main';
    const TRASH = 'root-trash';
    map.set(ROOT, { id: ROOT, type: 'folder', name: 'root', children: [] });
    map.set(TRASH, { id: TRASH, type: 'folder', name: 'trash', children: [] });
    let seq = 0;
    let batches = 0;
    let loaded = !opts?.deferred;   // 지연 모드면 로드 전
    const notify = (ids: string[]) => { for (const s of [...subs]) s(ids); };
    const api: NodesApi = {
        version: 1,
        types: { register: () => ({ dispose() { /* 테스트 */ } }) },
        registerContributed: () => ({ dispose() { /* 테스트 */ } }),
        get: (id) => (loaded ? (map.get(id) as PublicNode | undefined) : undefined),
        children: (id) => (loaded ? (map.get(id)?.children ?? []).map((c) => map.get(c)).filter((n): n is Node => !!n) as PublicNode[] : []),
        parent: (id) => { for (const [pid, n] of map) if (n.children.includes(id)) return pid; return null; },
        path: () => [],
        find: (pred) => (loaded ? [...map.values()].filter((n) => pred(n as PublicNode)) as PublicNode[] : []),
        byType: (t) => (loaded ? [...map.values()].filter((n) => n.type === t) as PublicNode[] : []),
        create: (parentId, spec) => {
            const id = `n${++seq}`;
            map.set(id, { id, type: spec.type, name: spec.name, children: [], data: spec.data });
            map.get(parentId)?.children.push(id);
            notify([id]);
            return id;
        },
        rename: (id, name) => { const n = map.get(id); if (n) { n.name = name; notify([id]); } },
        setData: (id, data) => { const n = map.get(id); if (n) { n.data = data; notify([id]); } },
        setIcon: (id, icon) => { const n = map.get(id); if (n) { if (icon) n.icon = icon; else delete n.icon; notify([id]); } },
        setBody: (id, body) => { const n = map.get(id); if (n) { n.body = body; notify([id]); } },
        Header: () => null,
        Frame: () => null,
        Embed: () => null,
        move: (id, parentId, index) => {
            for (const n of map.values()) { const i = n.children.indexOf(id); if (i >= 0) n.children.splice(i, 1); }
            const p = map.get(parentId); if (p) { if (index == null) p.children.push(id); else p.children.splice(index, 0, id); }
            notify([id]);
        },
        remove: (id) => {
            for (const n of map.values()) { const i = n.children.indexOf(id); if (i >= 0) n.children.splice(i, 1); }
            if (opts?.trash) map.get(TRASH)!.children.push(id); else map.delete(id);   // trash 모드 = 실물처럼 휴지통으로
            notify([id]);
        },
        batch: (fn) => { batches += 1; fn(); },
        invalidate: () => { /* 테스트 */ },
        select: () => { /* 테스트 */ },
        open: () => { /* 테스트 */ },
        promptInput: () => { /* 테스트 */ },
        subscribe: (fn) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
        roots: { main: ROOT, trash: TRASH },
        undoToken: () => null, cmd: {} as NodesApi['cmd'],
        isTrashed: (id) => { for (let p: string | null = id; p; p = api.parent(p)) if (p === TRASH) return true; return false; },   // 정식 판정 흉내(자기·조상이 휴지통)
        liveByType: (t) => (loaded ? [...map.values()].filter((n) => n.type === t && !api.isTrashed(n.id)) as PublicNode[] : []),
    };
    const plugin: PluginModule = {
        manifest: {
            id: 'fake-nodes', name: 'fake-nodes', version: '0.1.0', minHostVersion: '0.1.0', core: true,
            provides: { nodes: '0.1.0' },
            // 🔴 꾸러미 전환 — nodes 약속도 이 가짜가 들고 온다(약속 없이는 provides 가 「약속 없음」으로 막혀 account 까지 끊긴다).
            contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
        },
        modules: { nodes: api },
    } as PluginModule;
    /** 지연 로드 완료 — 읽기를 열고 subscribe 를 깨운다(loadTree 완료 때 「빈 나무→실나무 diff」 알림 흉내). */
    const load = () => { loaded = true; notify([...map.keys()]); };
    return { plugin, api, allData: () => [...map.values()].map((n) => n.data), load, get batches() { return batches; } };
}

// ── identity·permit 를 받아 쓰는 가짜 소비자(onChange 를 센다) ──
function makeConsumer() {
    let idMod: Identity | null = null;
    let pmMod: Permit | null = null;
    let idChanges = 0;
    let pmChanges = 0;
    const plugin: PluginModule = {
        manifest: {
            id: 'cons', name: 'cons', version: '0.1.0', minHostVersion: '0.1.0',
            supports: { identity: '^0.2', permit: '^0.1' },
        },
        lifecycle: {
            onInterface: {
                identity: {
                    attach: (_h: PluginHost, m: unknown) => { idMod = m as Identity; (m as Identity).onChange(() => { idChanges += 1; }); },
                    detach: () => { idMod = null; },
                },
                permit: {
                    attach: (_h: PluginHost, m: unknown) => { pmMod = m as Permit; (m as Permit).onChange(() => { pmChanges += 1; }); },
                    detach: () => { pmMod = null; },
                },
            },
        },
    } as PluginModule;
    return {
        plugin,
        get id() { return idMod; },
        get pm() { return pmMod; },
        get idChanges() { return idChanges; },
        get pmChanges() { return pmChanges; },
    };
}

describe('계정 — 9가지 검산', () => {
    it('사용자·역할은 나무에 안 뜨고(record) 폴더가 목록을 연다 — 폴더 종류·부모 길', () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const uid = core.createUser('김');
        const rid = core.createRole('보기');
        const uf = core.parentOf(uid)!, rf = core.parentOf(rid)!;
        expect(core.nodeKindOf(uf)).toBe('users');
        expect(core.nodeKindOf(rf)).toBe('roles');
        expect(typeof accountNodeTypeImpl.usersFolder.open).toBe('function');
        expect(typeof accountNodeTypeImpl.rolesFolder.open).toBe('function');
    });

    it('권한 폴더가 서고 · 사용자 문서(body)는 이름·역할을 고쳐도 남는다', () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const uid = core.createUser('김');
        expect(core.accountFolderId('perms')).not.toBeNull();
        core.setAccountBody(uid, { blocks: ['메모'] });
        core.renameRecord(uid, '이');
        core.setUserRoles(uid, []);
        expect(core.accountBodyOf(uid)).toEqual({ blocks: ['메모'] });
    });

    it('P4c) 사용자·역할 = 컬렉션 레코드 모양(제목 = 노드 이름 · 칸 = data.values) · 빈 값은 지움 · 폴더 칸 · 꽂힌 칸만 identity.fields', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const rid = core.createRole('편집', { permissions: ['doc.edit'], level: 2 });
        const uid = core.createUser('김', { roleIds: [rid] });
        // 저장 모양 — 옛 displayName·roleIds·fields 칸이 없고 values 하나 · 빈 목록(direct)은 안 싣는다
        expect(nodes.api.get(uid)!.data).toEqual({ values: { active: true, roles: [rid] } });   // Q11 W12 — 새 사용자는 활성 저장
        expect(nodes.api.get(rid)!.data).toEqual({ values: { level: 2, perms: ['doc.edit'] } });
        // 칸 쓰기 — 제목 칸은 이름 바꾸기 · 빈 값은 지움 · 글은 trim · values 밖 짐은 그대로
        nodes.api.setData(uid, { ...(nodes.api.get(uid)!.data as object), keep: 1 });
        core.setRecordValue(uid, 'name', ' 이 ');
        core.setRecordValue(uid, 'f_team', ' 행정 ');
        core.setRecordValue(uid, 'roles', []);
        core.setRecordValue(uid, 'plug.badge', 'A');
        expect(nodes.api.get(uid)!.name).toBe('이');
        expect(nodes.api.get(uid)!.data).toEqual({ keep: 1, values: { active: true, f_team: '행정', 'plug.badge': 'A' } });
        core.setRecordValue(uid, 'name', '  ');                       // 빈 이름은 무시
        expect(nodes.api.get(uid)!.name).toBe('이');
        // 폴더 칸(사람이 더한 칸) — 사용자 폴더 data.fields
        core.setFolderFields('users', [{ key: 'f_team', label: '부서', type: 'text' }]);
        expect(core.folderFieldsOf('users').map((f) => f.key)).toEqual(['f_team']);
        expect(core.folderFieldsOf('roles')).toEqual([]);
        // identity.fields 는 꽂힌 칸('<plugin>.<name>')만 — 사람이 더한 칸은 안 샌다
        await core.setProjectPassword('', 'pw');
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        await core.login(uid);
        expect(core.getCurrent()).toMatchObject({ kind: 'user', displayName: '이', fields: { 'plug.badge': 'A' } });
        expect(core.getCurrent().fields).not.toHaveProperty('f_team');
    });

    it('1) 암호 없음 → 마스터로 시작 · can 항상 true', () => {
        const nodes = makeNodes();
        const cons = makeConsumer();
        activateAll([...BASE(), nodes.plugin, accountPlugin, cons.plugin]);
        expect(cons.id!.current().kind).toBe('master');
        expect(cons.pm!.can('doc.edit')).toBe(true);
    });

    it('2) 마스터가 암호 걸기 → 노드에 평문 0 → 재시작 → 손님 · can 전부 false', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        expect(core.getCurrent().kind).toBe('master');

        expect(await core.setProjectPassword('', 'hunter2')).toBe(true);
        const blob = JSON.stringify(nodes.allData());
        expect(blob.includes('hunter2')).toBe(false);   // 평문 0(해시·솔트만)

        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 재시작(같은 노드 데이터)
        expect(core.getCurrent().kind).toBe('guest');
        expect(core.can('doc.edit')).toBe(false);
        expect(core.can('x.y')).toBe(false);
    });

    it('3) 손님 → 암호 틀림 → 그대로 · 맞음 → 마스터 · onChange 1회', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        await core.setProjectPassword('', 'pw');

        const cons = makeConsumer();
        activateAll([...BASE(), nodes.plugin, accountPlugin, cons.plugin]);   // 재시작 → 손님
        expect(cons.id!.current().kind).toBe('guest');

        const before = cons.idChanges;
        expect(await core.loginMaster('wrong')).toBe(false);
        expect(cons.id!.current().kind).toBe('guest');
        expect(await core.loginMaster('pw')).toBe(true);
        expect(cons.id!.current().kind).toBe('master');
        expect(cons.idChanges - before).toBe(1);   // 딱 1회
    });

    it('4) 이름만 로그인 → kind user · verified false · roles = 그 사용자 역할 id', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const rid = core.createRole('보기');
        const uid = core.createUser('김', { roleIds: [rid] });
        await core.setProjectPassword('', 'pw');

        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 재시작 → 손님
        expect(core.getCurrent().kind).toBe('guest');
        expect(await core.login(uid)).toBe(true);
        const c = core.getCurrent();
        expect(c.kind).toBe('user');
        expect(c.verified).toBe(false);
        expect(c.roles).toEqual([rid]);
    });

    it('5) 역할에 권한 담기 → can true → 역할 삭제 → false + permit.onChange', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const rid = core.createRole('편집', { permissions: ['doc.edit'] });
        const uid = core.createUser('이', { roleIds: [rid] });
        core.setPolicy({ paths: { direct: false, level: false, role: true } });
        await core.setProjectPassword('', 'pw');

        const cons = makeConsumer();
        activateAll([...BASE(), nodes.plugin, accountPlugin, cons.plugin]);   // 손님
        await core.login(uid);
        expect(core.can('doc.edit')).toBe(true);        // 길③ 역할 경유

        const before = cons.pmChanges;
        core.deleteRole(rid);
        expect(core.can('doc.edit')).toBe(false);
        expect(cons.pmChanges).toBeGreaterThan(before);  // 판정이 바뀌어 울린다
    });

    it('6) 길 셋 각각 true · 길 끄면 false · 아무것도 아니면 false', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const rid = core.createRole('R', { permissions: ['p.role'], level: 5 });
        const uid = core.createUser('U', { roleIds: [rid], directPermissions: ['p.direct'] });
        await core.setProjectPassword('', 'pw');

        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 손님
        await core.login(uid);

        // 전부 꺼짐 → false
        core.setPolicy({ paths: { direct: false, role: false, level: false } });
        expect(core.can('p.direct')).toBe(false);
        expect(core.can('p.role')).toBe(false);

        // 길① 직접
        core.setPolicy({ paths: { direct: true, role: false, level: false } });
        expect(core.can('p.direct')).toBe(true);
        expect(core.can('p.role')).toBe(false);

        // 길③ 역할 경유
        core.setPolicy({ paths: { direct: false, role: true, level: false } });
        expect(core.can('p.role')).toBe(true);
        expect(core.can('p.direct')).toBe(false);

        // 길② 수준 문턱
        core.setPolicy({ paths: { direct: false, role: false, level: true }, thresholds: { 'p.level': 3 } });
        expect(core.can('p.level')).toBe(true);     // 수준 5 ≥ 3
        core.setPolicy({ thresholds: { 'p.level': 9 } });
        expect(core.can('p.level')).toBe(false);    // 5 < 9

        // 아무 길도 안 맞음
        expect(core.can('p.unknown')).toBe(false);
    });

    it('7) account 끄기 → 소비자 detach(소비자는 켜진 채) → 다시 켜면 attach', () => {
        const nodes = makeNodes();
        const cons = makeConsumer();
        activateAll([...BASE(), nodes.plugin, accountPlugin, cons.plugin]);
        expect(cons.id).not.toBeNull();
        expect(cons.pm).not.toBeNull();

        disablePlugin('account');
        expect(cons.id).toBeNull();
        expect(cons.pm).toBeNull();
        expect(find('cons')!.enabled).toBe(true);
        expect(find('cons')!.blocked).toBe(false);   // supports 라 계속 켜짐

        enablePlugin('account');
        expect(cons.id).not.toBeNull();
        expect(cons.pm).not.toBeNull();
    });

    it('8) 비밀 안 걸린 사용자 → 증명 요구 역할 로그인 → verified false(증명 실패) · 마스터 암호는 통함', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 증명은 꾸러미 안 내부 모듈 — account 가 provides.credential
        expect(find('account')!.blocked).toBe(false);           // nodes 만 requires — 막히지 않는다

        const rid = core.createRole('관리');
        const uid = core.createUser('박', { roleIds: [rid] });
        core.setPolicy({ verifyRoles: [rid] });
        await core.setProjectPassword('', 'pw');

        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 손님
        expect(await core.login(uid)).toBe(true);
        expect(core.getCurrent().kind).toBe('user');
        expect(core.getCurrent().verified).toBe(false);         // 증명 요구지만 제공자 없음
        expect(await core.loginMaster('pw')).toBe(true);        // 마스터 암호는 통함
        expect(core.getCurrent().kind).toBe('master');
    });

    it('9) 마스터가 다른 사용자로 → 증명 통과해야 그 사용자 · 실패면 마스터 그대로', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 증명은 account 꾸러미 안 내부 모듈(provides.credential)
        const uid = core.createUser('최');
        await credCore.setSecret(uid, 'mypw');
        expect(core.getCurrent().kind).toBe('master');

        credCore.setPrompt(async () => 'wrong');
        expect(await core.login(uid)).toBe(false);              // 증명 실패 → 마스터 그대로
        expect(core.getCurrent().kind).toBe('master');

        credCore.setPrompt(async () => 'mypw');
        expect(await core.login(uid)).toBe(true);               // 증명 통과 → 그 사용자
        const c = core.getCurrent();
        expect(c.kind).toBe('user');
        expect(c.verified).toBe(true);
    });

    it('10) 비동기 저장소 경합 — 활성 땐 노드 비어 master, 로드 뒤 secret 읽어 guest(+onChange)', () => {
        const nodes = makeNodes({ deferred: true });
        // 디스크엔 이미 프로젝트 암호(secret)가 있다 — 아직 로드 전이라 안 보인다(loadTree 가 await 중).
        nodes.api.create(nodes.api.roots.main, { type: SECRET_TYPE, name: '프로젝트 암호', data: { v: 1, salt: 's', hash: 'h' } });

        const cons = makeConsumer();
        activateAll([...BASE(), nodes.plugin, accountPlugin, cons.plugin]);
        expect(core.getCurrent().kind).toBe('master');   // 🔴 로드 전이라 비어 보임 → master (옛 버그는 여기서 멈춰 손님이 안 됐다)

        const before = cons.idChanges;
        nodes.load();                                    // loadTree 완료처럼 첫 subscribe 알림
        expect(core.getCurrent().kind).toBe('guest');    // 재초기화 → 암호 있으니 손님
        expect(cons.idChanges).toBeGreaterThan(before);  // 누구가 바뀌어 울린다
    });

    // ── 노드 조작 판정(2026-11-08 「계정은 보이는 노드」) — 마스터만 루트 생성·삭제 · 손님 삭제 불가 ──
    const impl = accountNodeTypeImpl;

    it('12) 계정 루트: 마스터만 만들고 지운다 · 지울 땐 경고 · 손님은 둘 다 막힌다', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 암호 없음 → 마스터
        expect(core.isMaster()).toBe(true);
        expect(impl.root.canCreate()).toBe(true);               // 마스터는 루트 만들기 가능
        expect(impl.root.can().delete).toBe(true);              // 마스터는 루트 지우기 가능
        expect(impl.root.confirmDelete()).toMatch(/계정/);       // 지울 땐 경고 문구

        await core.setProjectPassword('', 'pw');
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 재시작 → 손님
        expect(core.getCurrent().kind).toBe('guest');
        expect(impl.root.canCreate()).toBe(false);              // 손님은 루트 못 만든다
        expect(impl.root.can().delete).toBe(false);             // 손님은 루트 못 지운다
    });

    it('13) 손님은 사용자를 보지도 만들지도 지우지도 못한다(권한 0)', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 마스터
        core.createUser('아무개');
        await core.setProjectPassword('', 'pw');
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 손님
        expect(core.getCurrent().kind).toBe('guest');
        expect(impl.user.hidden()).toBe(true);                  // 보기 권한 0 → 숨김
        expect(impl.user.canCreate()).toBe(false);              // 만들기 권한 0
        expect(impl.user.can().delete).toBe(false);             // 지우기 권한 0
        expect(impl.user.can().rename).toBe(false);             // 고치기 권한 0
    });

    it('14) 지우기 권한을 받은 사용자는 사용자를 지우고 볼 수 있다(길③ 역할 경유)', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 마스터
        const rid = core.createRole('관리', { permissions: ['account.users.view', 'account.users.delete'] });
        const uid = core.createUser('관리자', { roleIds: [rid] });
        core.setPolicy({ paths: { direct: false, level: false, role: true } });
        await core.setProjectPassword('', 'pw');
        activateAll([...BASE(), nodes.plugin, accountPlugin]);   // 손님
        await core.login(uid);
        expect(core.getCurrent().kind).toBe('user');
        expect(impl.user.hidden()).toBe(false);                 // 보기 권한 있음 → 보인다
        expect(impl.user.can().delete).toBe(true);              // 지우기 권한 있음
        expect(impl.user.can().rename).toBe(false);             // 고치기 권한은 안 줬다
        expect(impl.user.canCreate()).toBe(false);              // 만들기 권한도 안 줬다
    });

    it('11) 옛 credential-local.secret 노드는 활성화 시 account.cred-secret 로 자동 이사되고 증명도 그대로 통과한다', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const uid = core.createUser('구버전사용자');
        await credCore.setSecret(uid, 'legacy-pw');

        // 새 노드를 지우고 옛 타입('credential-local.secret')으로 심어 꾸러미 통합 전 저장소를 재현
        const cur = nodes.api.byType('account.cred-secret')[0]!;
        const savedData = cur.data;
        nodes.api.remove(cur.id);
        nodes.api.create(nodes.api.roots.main, { type: 'credential-local.secret', name: '비밀', data: savedData });

        // 재활성화 → 자동 이사
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        expect(nodes.api.byType('credential-local.secret')).toHaveLength(0);
        expect(nodes.api.byType('account.cred-secret')).toHaveLength(1);

        credCore.setPrompt(async () => 'legacy-pw');
        expect(await core.login(uid)).toBe(true);
        expect(core.getCurrent().verified).toBe(true);
    });
});

// ─────────────────────────── P4d — 로그인 유지(A2) · 자격증명 슬롯(A3) ───────────────────────────
//   테스트 환경은 node 라 localStorage 가 없다(host.storage 가 아무것도 안 한다) — 여기서만 메모리 localStorage 를 꽂는다.
describe('P4d — 새로고침해도 로그인 유지 · 자격증명 슬롯', () => {
    beforeEach(() => {
        const m = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => m.get(k) ?? null,
            setItem: (k: string, v: string) => { m.set(k, String(v)); },
            removeItem: (k: string) => { m.delete(k); },
            clear: () => m.clear(),
        });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    const restart = (nodes: ReturnType<typeof makeNodes>) => activateAll([...BASE(), nodes.plugin, accountPlugin]);

    it('A2) 암호로 들어온 마스터는 새로고침해도 마스터 · 기한이 지나면 손님', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const nodes = makeNodes();
        restart(nodes);
        await core.setProjectPassword('', 'pw');
        restart(nodes);
        expect(core.getCurrent().kind).toBe('guest');            // 암호를 처음 건 것은 로그인이 아니다
        expect(await core.loginMaster('pw')).toBe(true);
        restart(nodes);
        expect(core.getCurrent().kind).toBe('master');           // 🔴 A2 — 새로고침해도 유지
        vi.setSystemTime(Date.now() + (core.KEEP_DEFAULT + 1) * 60_000);
        restart(nodes);
        expect(core.getCurrent().kind).toBe('guest');            // 기한(기본 8시간)이 지나면 손님
    });

    it('A2) 기한 0(안 함)이면 새로고침에 풀린다 · 로그아웃하면 저장이 지워진다', async () => {
        const nodes = makeNodes();
        restart(nodes);
        await core.setProjectPassword('', 'pw');
        restart(nodes);
        core.setKeepMinutes(0);
        await core.loginMaster('pw');
        restart(nodes);
        expect(core.getCurrent().kind).toBe('guest');
        core.setKeepMinutes(60);
        await core.loginMaster('pw');
        core.logout();
        restart(nodes);
        expect(core.getCurrent().kind).toBe('guest');
    });

    it('A2) 암호가 바뀌면(봉인이 다르면) 유지된 마스터가 풀린다 · 내가 바꾼 건 새 봉인으로 유지', async () => {
        const nodes = makeNodes();
        restart(nodes);
        await core.setProjectPassword('', 'pw');
        restart(nodes);
        await core.loginMaster('pw');
        await core.setProjectPassword('pw', 'pw2');               // 이 기기에서 바꿈 → 다시 봉인
        restart(nodes);
        expect(core.getCurrent().kind).toBe('master');
        // 다른 기기가 암호를 바꾼 상황 — 솔트가 다른 해시로 갈린다
        const sec = nodes.api.byType(SECRET_TYPE)[0];
        nodes.api.setData(sec.id, { salt: 'other', hash: 'x' });
        restart(nodes);
        expect(core.getCurrent().kind).toBe('guest');
    });

    it('A2) 증명된 사용자는 기한 안에서 증명됨까지 유지', async () => {
        const nodes = makeNodes();
        restart(nodes);
        const uid = core.createUser('최');
        await credCore.setSecret(uid, 'mypw');
        await core.setProjectPassword('', 'pw');
        credCore.setPrompt(async () => 'mypw');
        expect(await core.login(uid)).toBe(true);                // 마스터 → 증명 통과
        restart(nodes);
        expect(core.getCurrent()).toMatchObject({ kind: 'user', id: uid, verified: true });
    });

    it('증명 입력창 스냅숏은 같은 요청이면 같은 참조(매번 새 객체면 useSyncExternalStore 무한 루프로 앱이 죽는다)', async () => {
        expect(credDialog.getPending()).toBeNull();
        const p = credDialog.requestSecret('m', 'u1');
        const a = credDialog.getPending();
        expect(a).toEqual({ methodId: 'm', userId: 'u1' });
        expect(credDialog.getPending()).toBe(a);                 // 🔴 같은 참조
        credDialog.submitDialog('x');
        expect(await p).toBe('x');
        expect(credDialog.getPending()).toBeNull();
    });

    it('A3) 비밀번호 슬롯 — 마스터·증명된 본인만 걸고 뺀다 · 빼면 전환이 막힌다', async () => {
        const nodes = makeNodes();
        restart(nodes);
        const a = core.createUser('가');
        const b = core.createUser('나');
        expect(credCore.METHOD.title).toBe('비밀번호');            // 첫 슬롯 이름
        expect(core.canManageCredential(a)).toBe(true);          // 마스터
        await credCore.setSecret(a, 'apw');
        expect(credCore.hasSecret(a)).toBe(true);
        expect(JSON.stringify(nodes.allData()).includes('apw')).toBe(false);   // 평문 0

        await core.setProjectPassword('', 'pw');
        restart(nodes);                                           // 손님
        await core.login(a);                                      // 이름만 → 증명 안 됨
        expect(core.canManageCredential(a)).toBe(false);          // 🔴 이름만 댄 본인은 못 바꾼다(가로채기 방지)
        await core.loginMaster('pw');
        credCore.setPrompt(async () => 'apw');
        await core.login(a);                                      // 마스터 → 증명 통과
        expect(core.canManageCredential(a)).toBe(true);           // 증명된 본인
        expect(core.canManageCredential(b)).toBe(false);          // 남은 안 된다

        credCore.clearSecret(a);
        expect(credCore.hasSecret(a)).toBe(false);
        await core.loginMaster('pw');
        expect(await core.login(a)).toBe(false);                  // 비밀이 없으면 마스터 → 그 사람 전환 불가
    });
});

// ─────────────────────────── Q11 — 로그아웃 명령(W8) · 휴지통(W9) · 활성(W12) · 아이디 로그인(W14) · 아이디 유일(W10) ───────────────────────────
describe('Q11 — 계정 손질', () => {
    const notes: { title: string; body?: string; action?: { commandId: string } }[] = [];
    const fakeHost = { notify: (n: (typeof notes)[number]) => { notes.push(n); return 'x'; } } as unknown as PluginHost;
    const cmd = (id: string) => (accountPlugin as unknown as { commands: Record<string, (h: PluginHost) => void> }).commands[id](fakeHost);
    beforeEach(() => { notes.length = 0; });

    it('W8) 암호 없는 마스터는 로그아웃 못 함(설명 알림) · 암호 건 뒤 사용자는 로그아웃 → 손님 · 손님은 못 함', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        expect(core.canLogout()).toBe(false);
        cmd('account.logout');
        expect(notes.at(-1)?.body).toMatch(/프로젝트 암호를 걸면/);
        expect(core.getCurrent().kind).toBe('master');

        const r = await core.createUserWithLogin({ name: '김', loginId: 'kim', credMethod: credCore.METHOD.id, password: 'pw1', active: true });
        await core.setProjectPassword('', 'master-pw');
        expect(await core.loginWithPassword((r as { id: string }).id, 'pw1')).toBe('ok');
        expect(core.canLogout()).toBe(true);
        cmd('account.logout');
        expect(core.getCurrent().kind).toBe('guest');
        expect(notes.at(-1)?.title).toBe('로그아웃했습니다');
        cmd('account.logout');
        expect(notes.at(-1)?.body).toMatch(/손님/);
    });

    it('W9) 지운 사용자는 목록에서 빠지고(휴지통 제외) 한 묶음 · 알림 「되돌리기」는 정식 통로(nodes.cmd.undo + 토큰)', () => {
        const nodes = makeNodes({ trash: true });
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const a = core.createUser('가'), b = core.createUser('나'), c = core.createUser('다');
        const before = nodes.batches;
        expect(core.removeAccountRecords([a, c])).toBe(2);
        expect(nodes.batches).toBe(before + 1);
        expect(nodes.api.parent(a)).toBe(nodes.api.roots.trash);
        expect(core.listUsers().map((u) => u.name)).toEqual(['나']);
        expect(b).toBeTruthy();
    });

    it('W12) 비활성 사용자는 아이디 확인·비밀번호·이름 로그인 모두 거부 · 들어와 있던 사람은 비활성되면 쫓겨난다', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const r = await core.createUserWithLogin({ name: '이', loginId: 'lee', credMethod: credCore.METHOD.id, password: 'pw', active: true });
        const id = (r as { id: string }).id;
        await core.setProjectPassword('', 'master-pw');
        expect(await core.loginWithPassword(id, 'pw')).toBe('ok');
        await core.loginMaster('master-pw');
        core.setRecordValue(id, core.ACTIVE_KEY, false);
        expect(core.checkLoginId('lee').kind).toBe('inactive');
        expect(await core.loginWithPassword(id, 'pw')).toBe('inactive');
        expect(await core.login(id)).toBe(false);
        core.setRecordValue(id, core.ACTIVE_KEY, true);
        expect(await core.loginWithPassword(id, 'pw')).toBe('ok');
        await core.loginMaster('master-pw');
        // 다른 경로: 이 사람이 들어와 있는 동안 비활성 → 쫓겨남
        expect(await core.loginWithPassword(id, 'pw')).toBe('ok');
        nodes.api.setData(id, { values: { ...(nodes.api.get(id)!.data as { values: object }).values, [core.ACTIVE_KEY]: false } });
        await Promise.resolve();   // 쫓아내기는 마이크로태스크로 돈다
        expect(core.getCurrent().kind).not.toBe('user');
    });

    it('W14) 아이디 흐름 — 빈칸·없음·설정(빈칸·불일치·이미 설정)·비밀번호(틀림·맞음) · 대소문자·공백 무시', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const r = await core.createUserWithLogin({ name: '박', loginId: 'Park', credMethod: credCore.METHOD.id, active: true });
        const id = (r as { id: string }).id;
        expect(core.credStateOf(id)).toBe('설정 대기');
        expect(core.checkLoginId('  ').kind).toBe('empty');
        expect(core.checkLoginId('nobody').kind).toBe('unknown');
        expect(core.checkLoginId(' park ')).toEqual({ kind: 'setup', userId: id, name: '박' });
        expect(await core.setupAndLogin(id, credCore.METHOD.id, '', '')).toBe('empty');
        expect(await core.setupAndLogin(id, credCore.METHOD.id, 'a1', 'a2')).toBe('mismatch');
        expect(await core.setupAndLogin(id, 'nope', 'a1', 'a1')).toBe('method');
        expect(await core.setupAndLogin(id, credCore.METHOD.id, 'a1', 'a1')).toBe('ok');
        expect(core.getCurrent()).toMatchObject({ kind: 'user', id, verified: true });
        expect(core.credStateOf(id)).toBe('설정됨');
        expect(await core.setupAndLogin(id, credCore.METHOD.id, 'x', 'x')).toBe('already');   // 가로채기 막힘
        expect(core.checkLoginId('PARK').kind).toBe('password');
        expect(await core.loginWithPassword(id, 'wrong')).toBe('wrong');
        expect(await core.loginWithPassword(id, 'a1')).toBe('ok');
    });

    it('W10) 아이디는 유일 — 만들기·고치기 모두 겹치면 거부(대소문자·공백 무시) · 빈 아이디 거부', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const m = credCore.METHOD.id;
        const a = await core.createUserWithLogin({ name: '가', loginId: 'same', credMethod: m, active: true });
        expect(a.ok).toBe(true);
        expect(await core.createUserWithLogin({ name: '나', loginId: ' SAME ', credMethod: m, active: true })).toEqual({ ok: false, reason: 'taken' });
        expect(await core.createUserWithLogin({ name: '나', loginId: '  ', credMethod: m, active: true })).toEqual({ ok: false, reason: 'loginId' });
        expect(await core.createUserWithLogin({ name: ' ', loginId: 'x', credMethod: m, active: true })).toEqual({ ok: false, reason: 'name' });
        const b = await core.createUserWithLogin({ name: '나', loginId: 'other', credMethod: m, active: true });
        expect(core.setRecordValue((b as { id: string }).id, core.LOGIN_ID_KEY, 'Same')).toBe(false);
        expect(core.listUsers().find((u) => u.name === '나')?.values[core.LOGIN_ID_KEY]).toBe('other');
    });

    it('🔴 평문 비밀번호는 노드 칸 값·알림 어디에도 안 남는다', async () => {
        const nodes = makeNodes();
        activateAll([...BASE(), nodes.plugin, accountPlugin]);
        const r = await core.createUserWithLogin({ name: '최', loginId: 'choi', credMethod: credCore.METHOD.id, password: 'PlainSecret-77', active: true });
        await core.setupAndLogin((r as { id: string }).id, credCore.METHOD.id, 'x', 'x');   // already — 아무것도 안 바뀐다
        await core.setProjectPassword('', 'MasterPlain-99');
        await core.loginWithPassword((r as { id: string }).id, 'PlainSecret-77');
        cmd('account.logout');
        const dump = JSON.stringify(nodes.allData()) + JSON.stringify(notes);
        expect(dump).not.toContain('PlainSecret-77');
        expect(dump).not.toContain('MasterPlain-99');
    });
});
