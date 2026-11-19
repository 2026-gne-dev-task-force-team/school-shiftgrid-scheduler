import { useEffect, useState } from 'react';
import { Alert, Button, Container, Group, Select, Tabs, Title } from '@mantine/core';
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

// 기관 화면 탭 — 폰 하단 바는 다섯(시간표·보결·특별실·근태·내 정보)만, 나머지는 「내 정보」 안 「더 보기」로
const PHONE_MAIN = ['grid', 'sub', 'rooms', 'att', 'me'];
function OrgTabs({ user, admin, P, phone, tabProps, onUser }) {
  const edit = user.role !== '보기만';
  const items = [
    { v: 'roster', label: '명단', show: admin },
    { v: 'school', label: '학교 기본', show: true },
    { v: 'grid', label: admin ? '시간표 격자' : '시간표 보기', phoneLabel: '시간표', show: true },
    { v: 'gen', label: '자동 생성', show: admin },
    { v: 'softset', label: '생성 설정', show: admin },
    { v: 'orgcfg', label: '기관 설정', show: admin },
    { v: 'out', label: '출력', show: true },
    { v: 'mine', label: '내 시간표', show: true },
    { v: 'att', label: '근태', show: edit },
    { v: 'sub', label: '보결', show: edit },
    { v: 'rooms', label: '특별실', show: edit },
    { v: 'audit', label: '기록', show: admin },
    { v: 'me', label: '내 정보', show: true },
  ].filter((i) => i.show);
  const [tab, setTab] = useState(admin ? 'roster' : 'mine');
  const bar = phone ? items.filter((i) => PHONE_MAIN.includes(i.v)) : items;
  const more = phone ? items.filter((i) => !PHONE_MAIN.includes(i.v)) : [];
  return (
    <Tabs value={tab} onChange={setTab} keepMounted={false} {...tabProps}>
      <Tabs.List mb="md" mr={phone ? 0 : 'md'} className={phone ? 'app-tabs-bottom' : undefined}>
        {bar.map((i) => <Tabs.Tab key={i.v} value={i.v}>{phone && i.phoneLabel ? i.phoneLabel : i.label}</Tabs.Tab>)}
      </Tabs.List>
      {admin && <Tabs.Panel value="roster"><Roster orgId={user.orgId} /></Tabs.Panel>}
      <Tabs.Panel value="school"><SchoolPage user={user} /></Tabs.Panel>
      <Tabs.Panel value="grid"><Grid P={P} admin={admin} /></Tabs.Panel>
      {admin && <Tabs.Panel value="gen"><AutoGen P={P} /></Tabs.Panel>}
      {admin && <Tabs.Panel value="softset"><SoftSettings P={P} /></Tabs.Panel>}
      {admin && <Tabs.Panel value="orgcfg"><OrgConfig P={P} /></Tabs.Panel>}
      <Tabs.Panel value="out"><Output P={P} admin={admin} /></Tabs.Panel>
      <Tabs.Panel value="mine"><Mine P={P} /></Tabs.Panel>
      {edit && <Tabs.Panel value="att"><Attendance P={P} admin={admin} /></Tabs.Panel>}
      <Tabs.Panel value="sub"><Substitute P={P} admin={admin} /></Tabs.Panel>
      <Tabs.Panel value="rooms"><Rooms P={P} admin={admin} /></Tabs.Panel>
      {admin && <Tabs.Panel value="audit"><AuditLog orgId={user.orgId} /></Tabs.Panel>}
      <Tabs.Panel value="me">
        {more.length > 0 && (
          <Group mb="md" className="no-print" data-testid="more-menu">
            {more.map((i) => <Button key={i.v} variant="light" onClick={() => setTab(i.v)}>{i.label}</Button>)}
          </Group>
        )}
        <ChangePassword onDone={onUser} />
      </Tabs.Panel>
    </Tabs>
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
