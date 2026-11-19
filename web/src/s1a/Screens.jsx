import { useEffect, useState } from 'react';
import { Alert, Button, Container, Group, Select, Tabs, Text, Title, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { api } from '../api.js';
import ChangePassword from './ChangePassword.jsx';
import AdminOrgs from './AdminOrgs.jsx';
import Roster from './Roster.jsx';
import AuditLog from './AuditLog.jsx';
import SchoolPage from '../school/SchoolPage.jsx';
import Grid from '../s1c/Grid.jsx';
import Mine from '../s1c/Mine.jsx';
import AutoGen from '../s2/AutoGen.jsx';
import SoftSettings from '../s2b/SoftSettings.jsx';
import OrgConfig from '../settings/OrgConfig.jsx';
import { HelpModal, Welcome } from '../s1c/Guide.jsx';
import Attendance from '../s4a/Attendance.jsx';
import Substitute from '../s3/Substitute.jsx';
import Rooms from '../s3/Rooms.jsx';
import Output from '../s4b/Output.jsx';
import { useOrgConfig } from '../orgConfig.js';
import { visibleMenus } from '../features.js';

// S-1a 화면 묶음 — 첫 로그인 비번 변경 · 시스템 관리자(기관 관리) · 기관 관리자(명단 · 내 정보)
const A2HS_KEY = 'tt-a2hs-dismissed';
// 「홈 화면에 추가」 안내 — 폰 폭에서 한 번만, 닫으면 다시 안 뜬다
function AddToHome({ phone }) {
  const [shown, setShown] = useState(() => { try { return !localStorage.getItem(A2HS_KEY); } catch { return false; } });
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!phone || !shown || standalone) return null;
  const close = () => { try { localStorage.setItem(A2HS_KEY, '1'); } catch { /* 저장 못 해도 이번엔 닫힌다 */ } setShown(false); };
  return <Alert className="no-print" color="blue" mb="md" withCloseButton onClose={close}>홈 화면에 추가해 두면 앱처럼 바로 열립니다. 브라우저 메뉴(공유 또는 ⋮)에서 「홈 화면에 추가」를 누르세요.</Alert>;
}

const ORDER_KEY = 'tt-order-hint-dismissed';
// 관리자에게만 「처음이면 이 순서로」 — 닫으면 다시 안 뜬다
function OrderHint() {
  const [shown, setShown] = useState(() => { try { return !localStorage.getItem(ORDER_KEY); } catch { return false; } });
  if (!shown) return null;
  const close = () => { try { localStorage.setItem(ORDER_KEY, '1'); } catch { /* 저장 못 해도 이번엔 닫힌다 */ } setShown(false); };
  return <Group gap="xs" mb="sm" className="no-print" wrap="nowrap" align="flex-start"><Text size="sm" c="dimmed" style={{ flex: 1 }}>처음이면 이 순서로: 명단 → 학교 기본 → 생성 설정 → 자동 생성 → 시간표 격자 → 출력</Text><Button variant="subtle" size="compact-xs" color="gray" onClick={close}>닫기</Button></Group>;
}

function Panel({ v, hint, children }) {
  return <Tabs.Panel value={v}>{hint && <Text size="sm" c="dimmed" mb="sm" className="no-print">{hint}</Text>}{children}</Tabs.Panel>;
}

// 기관 화면 탭 — 폰 하단 바는 다섯(시간표·보결·특별실·근태·내 정보)만, 나머지는 「내 정보」 안 「더 보기」로
const PHONE_MAIN = ['grid', 'sub', 'rooms', 'att', 'me'];
function OrgTabs({ user, admin, P, phone, tabProps, onUser }) {
  const edit = user.role !== '보기만';
  const all = [
    { v: 'roster', label: '명단', hint: '교직원 명단을 처음 올리거나 고칠 때', show: admin },
    { v: 'school', label: '학교 기본', hint: admin ? '학급·교과·시수 같은 학교 기본 자료를 넣을 때' : '우리 학교 학급·교과 자료를 확인할 때', show: true },
    { v: 'grid', label: admin ? '시간표 격자' : '시간표 보기', phoneLabel: '시간표', hint: admin ? '만든 시간표를 칸마다 확인하고 직접 고칠 때' : '학교 전체 시간표를 둘러볼 때', show: true },
    { v: 'gen', label: '자동 생성', hint: '명단·시수를 다 넣은 뒤 시간표 초안을 만들 때', show: admin },
    { v: 'softset', label: '생성 설정', hint: '자동 생성이 지킬 권장 규칙의 세기를 조절할 때', show: admin },
    { v: 'orgcfg', label: '기관 설정', hint: '요일·학기·보결 순서 등 학교별 값을 바꿀 때', show: admin },
    { v: 'out', label: '출력', hint: admin ? '완성한 시간표를 인쇄하거나 파일로 받을 때' : '시간표를 인쇄하거나 파일로 받을 때', show: true },
    { v: 'mine', label: '내 시간표', hint: '내 수업 시간표만 따로 볼 때', show: true },
    { v: 'att', label: '근태', hint: admin ? '보조인력의 근무시간을 기록·집계할 때' : '내 근무시간을 기록하고 확인할 때', show: edit },
    { v: 'sub', label: '보결', hint: admin ? '결강 수업을 대신할 교사를 정할 때' : '결강 수업의 보결 배정을 보거나 맡을 때', show: edit },
    { v: 'rooms', label: '특별실', hint: '특별실 사용 칸을 방별로 보고 배정할 때', show: edit },
    { v: 'audit', label: '기록', hint: '누가 언제 무엇을 바꿨는지 확인할 때', show: admin },
    { v: 'me', label: '내 정보', hint: '비밀번호를 바꾸거나 더 보기 메뉴를 열 때', show: true },
  ];
  const items = visibleMenus(all, useOrgConfig(P).features); // 권한(show) AND 기관 스위치
  const on = (v) => items.some((i) => i.v === v);
  const H = Object.fromEntries(items.map((i) => [i.v, i.hint]));
  const [want, setTab] = useState(admin ? 'roster' : 'mine');
  const tab = on(want) ? want : 'grid'; // 숨긴 탭이면 시간표로
  const bar = phone ? items.filter((i) => PHONE_MAIN.includes(i.v)) : items;
  const more = phone ? items.filter((i) => !PHONE_MAIN.includes(i.v)) : [];
  return (
    <>
    {admin && <OrderHint />}
    <Tabs value={tab} onChange={setTab} keepMounted={false} {...tabProps}>
      <Tabs.List mb="md" mr={phone ? 0 : 'md'} className={phone ? 'app-tabs-bottom' : undefined}>
        {bar.map((i) => <Tooltip key={i.v} label={i.hint} disabled={phone || !i.hint} openDelay={300}><Tabs.Tab value={i.v}>{phone && i.phoneLabel ? i.phoneLabel : i.label}</Tabs.Tab></Tooltip>)}
      </Tabs.List>
      {on('roster') && <Panel v="roster" hint={H.roster}><Roster orgId={user.orgId} /></Panel>}
      {on('school') && <Panel v="school" hint={H.school}><SchoolPage user={user} /></Panel>}
      <Panel v="grid" hint={H.grid}><Grid P={P} admin={admin} /></Panel>
      {on('gen') && <Panel v="gen" hint={H.gen}><AutoGen P={P} /></Panel>}
      {on('softset') && <Panel v="softset" hint={H.softset}><SoftSettings P={P} /></Panel>}
      {on('orgcfg') && <Panel v="orgcfg" hint={H.orgcfg}><OrgConfig P={P} /></Panel>}
      {on('out') && <Panel v="out" hint={H.out}><Output P={P} admin={admin} /></Panel>}
      {on('mine') && <Panel v="mine" hint={H.mine}><Mine P={P} /></Panel>}
      {on('att') && <Panel v="att" hint={H.att}><Attendance P={P} admin={admin} /></Panel>}
      {on('sub') && <Panel v="sub" hint={H.sub}><Substitute P={P} admin={admin} /></Panel>}
      {on('rooms') && <Panel v="rooms" hint={H.rooms}><Rooms P={P} admin={admin} /></Panel>}
      {on('audit') && <Panel v="audit" hint={H.audit}><AuditLog orgId={user.orgId} /></Panel>}
      <Panel v="me" hint={H.me}>
        {more.length > 0 && (
          <Group mb="md" className="no-print" data-testid="more-menu">
            {more.map((i) => <div key={i.v}><Button variant="light" onClick={() => setTab(i.v)}>{i.label}</Button><Text size="xs" c="dimmed" maw={160}>{i.hint}</Text></div>)}
          </Group>
        )}
        <ChangePassword onDone={onUser} />
      </Panel>
    </Tabs>
    </>
  );
}

export default function Screens({ user, onLogout, onUser }) {
  const [help, setHelp] = useState(false);
  const phone = useMediaQuery('(max-width: 48em)');
  const tabProps = phone ? {} : { orientation: 'vertical', placement: 'left' }; // PC 는 왼쪽 세로 탭
  const [mems, setMems] = useState([]);
  useEffect(() => {
    if (!user.mustChange) api('GET', '/auth/memberships').then((r) => setMems(r.items)).catch(() => setMems([]));
  }, [user.mustChange, user.orgId]);
  async function switchOrg(v) {
    if (!v || Number(v) === user.orgId) return;
    const r = await api('POST', '/auth/switch-org', { orgId: Number(v) });
    onUser(r.user);
    window.location.reload(); // 새 세션·새 CSRF 로 화면 전체를 다시 읽는다
  }
  const inOrg = !user.mustChange && user.role !== '시스템관리자';
  let body;
  if (user.mustChange) {
    body = <ChangePassword forced onDone={onUser} />;
  } else if (user.role === '시스템관리자') {
    body = (
      <Tabs defaultValue="orgs" {...tabProps}>
        <Tabs.List mb="md" mr={phone ? 0 : 'md'} className={phone ? 'app-tabs-bottom' : undefined}>
          <Tabs.Tab value="orgs">기관 관리</Tabs.Tab>
          <Tabs.Tab value="audit">기록</Tabs.Tab>
          <Tabs.Tab value="me">내 정보</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="orgs"><AdminOrgs /></Tabs.Panel>
        <Tabs.Panel value="audit"><AuditLog /></Tabs.Panel>
        <Tabs.Panel value="me"><ChangePassword onDone={onUser} /></Tabs.Panel>
      </Tabs>
    );
  } else {
    // 기관관리자 · 교직원 · 보기만 — 메뉴 하나로 묶는다(명단은 관리자만)
    const admin = user.role === '기관관리자';
    const P = `/orgs/${user.orgId}`;
    body = <OrgTabs user={user} admin={admin} P={P} phone={phone} tabProps={tabProps} onUser={onUser} />;
  }
  return (
    <Container size="lg" py="md" className="app-body">
      <Group justify="space-between" mb="md">
        <Title order={3}>{user.name}님</Title>
        <Group className="no-print">
          {mems.length > 1 && <Select aria-label="기관 바꾸기" data={mems.map((m) => ({ value: String(m.orgId), label: m.name }))} value={String(user.orgId)} onChange={switchOrg} allowDeselect={false} w={200} />}
          {inOrg && <Button variant="default" onClick={() => setHelp(true)}>도움말</Button>}
          <Button variant="default" onClick={onLogout}>로그아웃</Button>
        </Group>
      </Group>
      <AddToHome phone={phone} />
      {body}
      {inOrg && <Welcome P={`/orgs/${user.orgId}`} admin={user.role === '기관관리자'} />}
      {inOrg && <HelpModal opened={help} onClose={() => setHelp(false)} admin={user.role === '기관관리자'} />}
    </Container>
  );
}
