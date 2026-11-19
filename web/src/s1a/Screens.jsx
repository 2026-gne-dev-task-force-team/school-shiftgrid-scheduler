import { useEffect, useState } from 'react';
import { Button, Container, Group, Select, Tabs, Title } from '@mantine/core';
import { api } from '../api.js';
import ChangePassword from './ChangePassword.jsx';
import AdminOrgs from './AdminOrgs.jsx';
import Roster from './Roster.jsx';
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
export default function Screens({ user, onLogout, onUser }) {
  const [help, setHelp] = useState(false);
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
      <Tabs defaultValue="orgs">
        <Tabs.List mb="md">
          <Tabs.Tab value="orgs">기관 관리</Tabs.Tab>
          <Tabs.Tab value="me">내 정보</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="orgs"><AdminOrgs /></Tabs.Panel>
        <Tabs.Panel value="me"><ChangePassword onDone={onUser} /></Tabs.Panel>
      </Tabs>
    );
  } else {
    // 기관관리자 · 교직원 · 보기만 — 메뉴 하나로 묶는다(명단은 관리자만)
    const admin = user.role === '기관관리자';
    const P = `/orgs/${user.orgId}`;
    body = (
      <Tabs defaultValue={admin ? 'roster' : 'mine'} keepMounted={false}>
        <Tabs.List mb="md">
          {admin && <Tabs.Tab value="roster">명단</Tabs.Tab>}
          <Tabs.Tab value="school">학교 기본</Tabs.Tab>
          <Tabs.Tab value="grid">{admin ? '시간표 격자' : '시간표 보기'}</Tabs.Tab>
          {admin && <Tabs.Tab value="gen">자동 생성</Tabs.Tab>}
          {admin && <Tabs.Tab value="softset">생성 설정</Tabs.Tab>}
          {admin && <Tabs.Tab value="orgcfg">기관 설정</Tabs.Tab>}
          <Tabs.Tab value="out">출력</Tabs.Tab>
          <Tabs.Tab value="mine">내 시간표</Tabs.Tab>
          {user.role !== '보기만' && <Tabs.Tab value="att">근태</Tabs.Tab>}
          {user.role !== '보기만' && <Tabs.Tab value="sub">보결</Tabs.Tab>}
          {user.role !== '보기만' && <Tabs.Tab value="rooms">특별실</Tabs.Tab>}
          <Tabs.Tab value="me">내 정보</Tabs.Tab>
        </Tabs.List>
        {admin && <Tabs.Panel value="roster"><Roster orgId={user.orgId} /></Tabs.Panel>}
        <Tabs.Panel value="school"><SchoolPage user={user} /></Tabs.Panel>
        <Tabs.Panel value="grid"><Grid P={P} admin={admin} /></Tabs.Panel>
        {admin && <Tabs.Panel value="gen"><AutoGen P={P} /></Tabs.Panel>}
        {admin && <Tabs.Panel value="softset"><SoftSettings P={P} /></Tabs.Panel>}
        {admin && <Tabs.Panel value="orgcfg"><OrgConfig P={P} /></Tabs.Panel>}
        <Tabs.Panel value="out"><Output P={P} admin={admin} /></Tabs.Panel>
        <Tabs.Panel value="mine"><Mine P={P} /></Tabs.Panel>
        {user.role !== '보기만' && <Tabs.Panel value="att"><Attendance P={P} admin={admin} /></Tabs.Panel>}
        <Tabs.Panel value="sub"><Substitute P={P} admin={admin} /></Tabs.Panel>
        <Tabs.Panel value="rooms"><Rooms P={P} admin={admin} /></Tabs.Panel>
        <Tabs.Panel value="me"><ChangePassword onDone={onUser} /></Tabs.Panel>
      </Tabs>
    );
  }
  return (
    <Container size="lg" py="md">
      <Group justify="space-between" mb="md">
        <Title order={3}>{user.name}님</Title>
        <Group className="no-print">
          {mems.length > 1 && <Select aria-label="기관 바꾸기" data={mems.map((m) => ({ value: String(m.orgId), label: m.name }))} value={String(user.orgId)} onChange={switchOrg} allowDeselect={false} w={200} />}
          {inOrg && <Button variant="default" onClick={() => setHelp(true)}>도움말</Button>}
          <Button variant="default" onClick={onLogout}>로그아웃</Button>
        </Group>
      </Group>
      {body}
      {inOrg && <Welcome P={`/orgs/${user.orgId}`} admin={user.role === '기관관리자'} />}
      {inOrg && <HelpModal opened={help} onClose={() => setHelp(false)} admin={user.role === '기관관리자'} />}
    </Container>
  );
}
