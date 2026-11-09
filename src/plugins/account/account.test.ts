/**
 * 계정 검산 — 가짜 nodes 제공자 + 약속 플러그인 + activateAll 로 9가지를 잰다(쥔님 2026-11-08 설계).
 *   🔴 실 플러그인(탐색기) 대신 인메모리 nodes 제공자를 쓴다 — 레코드 노드 저장·byType·subscribe 를 실제로 돌린다.
 *   ⛔ account 를 src/app/plugins.ts 에 등록하지 않는다(머지·등록은 메인) — 여기서 목록을 직접 넘긴다.
 *   (테스트 파일은 구조 검사 walk 에서 빠지므로 형제 플러그인 core 를 값으로 import 해도 된다.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { activateAll, disablePlugin, enablePlugin, listPlugins, disposeOwner } from '../../pane-ui-system/plugin';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import type { Identity } from './contracts/identity';
import type { Permit } from './contracts/permit';
import type { NodesApi, Node, PublicNode } from '../explorer/contracts/nodes';

import { accountPlugin } from './index';
import * as core from './core';
import * as credCore from './credential/core';
import { SECRET_TYPE, accountNodeTypeImpl } from './nodes';

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
function makeNodes(opts?: { deferred?: boolean }) {
    const map = new Map<string, Node>();
    const subs = new Set<(ids: string[]) => void>();
    const ROOT = 'root-main';
    const TRASH = 'root-trash';
    map.set(ROOT, { id: ROOT, type: 'folder', name: 'root', children: [] });
    map.set(TRASH, { id: TRASH, type: 'folder', name: 'trash', children: [] });
    let seq = 0;
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
        Embed: () => null,
        move: (id, parentId, index) => {
            for (const n of map.values()) { const i = n.children.indexOf(id); if (i >= 0) n.children.splice(i, 1); }
            const p = map.get(parentId); if (p) { if (index == null) p.children.push(id); else p.children.splice(index, 0, id); }
            notify([id]);
        },
        remove: (id) => { for (const n of map.values()) { const i = n.children.indexOf(id); if (i >= 0) n.children.splice(i, 1); } map.delete(id); notify([id]); },
        batch: (fn) => { fn(); },
        invalidate: () => { /* 테스트 */ },
        select: () => { /* 테스트 */ },
        open: () => { /* 테스트 */ },
        promptInput: () => { /* 테스트 */ },
        subscribe: (fn) => { subs.add(fn); return { dispose() { subs.delete(fn); } }; },
        roots: { main: ROOT, trash: TRASH },
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
    return { plugin, api, allData: () => [...map.values()].map((n) => n.data), load };
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
        core.setUserName(uid, '이');
        core.setUserRoles(uid, []);
        expect(core.accountBodyOf(uid)).toEqual({ blocks: ['메모'] });
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
