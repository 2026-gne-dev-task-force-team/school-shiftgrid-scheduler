import { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Button, Container, Group, Select, Tabs, Text, Title } from '@mantine/core';
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
import FeatureBoard from '../settings/FeatureBoard.jsx';
import { HelpModal, MenuIntro, Welcome } from '../s1c/Guide.jsx';
import { orderLine } from '../../../shared/feature-guide.js';
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
function OrderHint({ features }) {
  const [shown, setShown] = useState(() => { try { return !localStorage.getItem(ORDER_KEY); } catch { return false; } });
  if (!shown) return null;
  const close = () => { try { localStorage.setItem(ORDER_KEY, '1'); } catch { /* 저장 못 해도 이번엔 닫힌다 */ } setShown(false); };
  return <Group gap="xs" mb="sm" className="no-print" wrap="nowrap" align="flex-start"><Text size="sm" c="dimmed" style={{ flex: 1 }}>처음이면 이 순서로: {orderLine(features)}. 시안은 시간표 격자에서 손볼 수 있습니다</Text><Button variant="subtle" size="compact-xs" color="gray" onClick={close}>닫기</Button></Group>;
}

const IntroCtx = createContext(null); // 첫 방문 안내 카드에 필요한 {user, features}
function Panel({ v, hint, children }) {
  const ctx = useContext(IntroCtx);
  return <Tabs.Panel value={v}>{hint && <Text size="sm" c="dimmed" mb="sm" className="no-print">{hint}</Text>}{ctx && <MenuIntro menu={v} user={ctx.user} features={ctx.features} />}{children}</Tabs.Panel>;
}

// 기관 화면 탭 — 폰 하단 바는 다섯(시간표·보결·특별실·근태·내 정보)만, 나머지는 「내 정보」 안 버튼으로
const PHONE_MAIN = ['grid', 'sub', 'rooms', 'att', 'me'];
function OrgTabs({ user, admin, P, phone, tabProps, onUser, features, loaded, setOv }) {
  const edit = user.role !== '보기만';
  const all = [
    { v: 'roster', label: '명단', hint: '교직원 명단을 올리고 고치는 곳입니다. 처음 한 번 먼저 채웁니다', show: admin },
    { v: 'school', label: '학교 기본', hint: admin ? '학급·교과·시수표 같은 학교 자료를 넣는 곳입니다. 시간표를 만들기 전에 채웁니다' : '우리 학교 학급·교과 자료를 확인하는 곳입니다', show: true },
    { v: 'grid', label: admin ? '시간표 격자' : '시간표', phoneLabel: '시간표', hint: admin ? '만든 시간표를 칸마다 확인하고 직접 고칩니다' : '학교 전체 시간표를 둘러봅니다', show: true },
    { v: 'gen', label: '자동 생성', hint: '명단과 시수표를 다 넣었으면 시간표 시안을 만들어 줍니다', show: admin },
    { v: 'softset', label: '생성 설정', hint: '자동 생성이 얼마나 신경 쓸지 정합니다. 처음엔 그대로 둬도 됩니다', show: admin },
    { v: 'orgcfg', label: '기관 설정', hint: '요일·학기·보결 순서처럼 학교마다 다른 값을 바꿉니다', show: admin },
    { v: 'out', label: '출력', hint: admin ? '완성한 시간표를 인쇄하거나 파일로 받습니다' : '시간표를 인쇄하거나 파일로 받습니다', show: true },
    { v: 'mine', label: '내 시간표', hint: '내 수업만 따로 모아 봅니다', show: true },
    { v: 'att', label: '근태', hint: admin ? '강사·보조 선생님의 근무시간을 적고 달마다 모읍니다' : '내 근무시간을 적고 확인합니다', show: edit },
    { v: 'sub', label: '보결', hint: admin ? '결강한 수업을 대신 맡을 선생님을 정합니다' : '결강 수업의 보결 배정을 보거나 맡습니다', show: edit },
    { v: 'rooms', label: '특별실', hint: '과학실·음악실 같은 특별실을 언제 누가 쓰는지 보고 예약합니다', show: edit },
    { v: 'audit', label: '기록', hint: '누가 언제 무엇을 바꿨는지 확인합니다', show: admin },
    { v: 'feat', label: '기능 고르기', hint: admin ? '필요한 기능만 켜고 끕니다. 넣어 둔 자료는 남습니다' : '우리 학교 시간표 도구에 어떤 기능이 있는지 봅니다', show: true },
    { v: 'me', label: '내 정보', hint: phone ? '비밀번호를 바꾸거나 나머지 메뉴를 엽니다' : '비밀번호를 바꿉니다', show: true },
  ];
  const [tip, setTip] = useState(null);
  const [want, setTab] = useState(admin ? 'roster' : 'mine');
  const items = visibleMenus(all, features); // 권한(show) AND 기관 스위치. 「기능 고르기」는 MENU_FEATURES 에 없어 늘 보인다
  const tryGo = (v, text) => { setTab(v); setTip(text); setTimeout(() => setTip(null), 12000); };
  const on = (v) => items.some((i) => i.v === v);
  const H = Object.fromEntries(items.map((i) => [i.v, i.hint]));
  const tab = on(want) ? want : 'grid'; // 숨긴 탭이면 시간표로
  if (!loaded) return null; // 설정을 받기 전엔 메뉴를 그리지 않는다(꺼진 탭이 잠깐 보였다 사라지는 깜빡임)
  const bar = phone ? items.filter((i) => PHONE_MAIN.includes(i.v)) : items;
  const more = phone ? items.filter((i) => !PHONE_MAIN.includes(i.v)) : [];
  return (
    <IntroCtx.Provider value={{ user, features }}>
    {admin && <OrderHint features={features} />}
    {tip && <Alert className="no-print" color="blue" mb="sm" withCloseButton onClose={() => setTip(null)}>{tip}</Alert>}
    <Tabs value={tab} onChange={setTab} keepMounted={false} {...tabProps}>
      <Tabs.List mb="md" mr={phone ? 0 : 'md'} className={phone ? 'app-tabs-bottom' : undefined}>
        {bar.map((i) => <Tabs.Tab key={i.v} value={i.v}>{phone && i.phoneLabel ? i.phoneLabel : i.label}</Tabs.Tab>)}
      </Tabs.List>
      {on('roster') && <Panel v="roster" hint={H.roster}><Roster orgId={user.orgId} /></Panel>}
      {on('school') && <Panel v="school" hint={H.school}><SchoolPage user={user} /></Panel>}
      <Panel v="grid" hint={H.grid}><Grid P={P} admin={admin} /></Panel>
      {on('gen') && <Panel v="gen"><AutoGen P={P} /></Panel>}
      {on('softset') && <Panel v="softset" hint={H.softset}><SoftSettings P={P} /></Panel>}
      {on('orgcfg') && <Panel v="orgcfg" hint={H.orgcfg}><OrgConfig P={P} /></Panel>}
      {on('out') && <Panel v="out" hint={H.out}><Output P={P} admin={admin} /></Panel>}
      {on('mine') && <Panel v="mine" hint={H.mine}><Mine P={P} /></Panel>}
      {on('att') && <Panel v="att" hint={H.att}><Attendance P={P} admin={admin} /></Panel>}
      {on('sub') && <Panel v="sub" hint={H.sub}><Substitute P={P} admin={admin} /></Panel>}
      {on('rooms') && <Panel v="rooms" hint={H.rooms}><Rooms P={P} admin={admin} /></Panel>}
      {on('audit') && <Panel v="audit" hint={H.audit}><AuditLog orgId={user.orgId} /></Panel>}
      <Panel v="feat" hint={H.feat}><FeatureBoard P={P} admin={admin} onChanged={setOv} onTry={tryGo} /></Panel>
      <Panel v="me" hint={H.me}>
        {more.length > 0 && (
          <Group mb="md" className="no-print" data-testid="more-menu">
            {more.map((i) => <div key={i.v}><Button variant="light" onClick={() => setTab(i.v)}>{i.label}</Button><Text size="xs" c="dimmed" maw={160}>{i.hint}</Text></div>)}
          </Group>
        )}
        <ChangePassword onDone={onUser} />
      </Panel>
    </Tabs>
    </IntroCtx.Provider>
  );
}

export default function Screens({ user, onLogout, onUser }) {
  const [help, setHelp] = useState(false);
  const phone = useMediaQuery('(max-width: 48em)');
  const tabProps = phone ? {} : { orientation: 'vertical', placement: 'left' }; // PC 는 왼쪽 세로 탭
  const [mems, setMems] = useState([]);
  const inOrg = !user.mustChange && user.role !== '시스템관리자';
  const orgP = inOrg ? `/orgs/${user.orgId}` : null;
  const base = useOrgConfig(orgP);
  const [ov, setOv] = useState(null); // 스위치판·따라 하기가 방금 바꾼 값(메뉴에 바로 반영)
  const features = ov ?? base.features;
  const [rev, setRev] = useState(0); // 「안내 다시 보기」 — 메뉴 화면을 새로 그려 카드를 다시 띄운다
  useEffect(() => {
    if (!user.mustChange) api('GET', '/auth/memberships').then((r) => setMems(r.items)).catch(() => setMems([]));
  }, [user.mustChange, user.orgId]);
  async function switchOrg(v) {
    if (!v || Number(v) === user.orgId) return;
    const r = await api('POST', '/auth/switch-org', { orgId: Number(v) });
    onUser(r.user);
    window.location.reload(); // 새 세션·새 CSRF 로 화면 전체를 다시 읽는다
  }
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
    body = <OrgTabs key={rev} user={user} admin={admin} P={P} phone={phone} tabProps={tabProps} onUser={onUser} features={features} loaded={!!ov || base.loaded} setOv={setOv} />;
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
      {inOrg && <Welcome P={orgP} admin={user.role === '기관관리자'} features={features} />}
      {inOrg && <HelpModal opened={help} onClose={() => setHelp(false)} admin={user.role === '기관관리자'} P={orgP} user={user} features={features} onChanged={setOv} onReset={() => setRev((r) => r + 1)} />}
    </Container>
  );
}
