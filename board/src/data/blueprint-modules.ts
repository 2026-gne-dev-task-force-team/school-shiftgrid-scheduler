// 설계도 탭의 정적 자료 — 「1.2v 설계 ① 통합 구조」 의 모듈과 1:1(R91).
// 원천: 1절 「가지 안 폴더」 표(shared/·supabase/) · 2절 「카탈로그 src/app/plugins.ts」 표(코어 5·받침 셋·판 다섯) · 11절 받침 셋 · 16절 판 쪼개기.
// 설계 ① 에 모듈이 늘거나 줄면 이 파일과 DESIGN_MODULES(시험이 1:1 대조)를 같이 고친다.

/** 줄(위→아래). 0 = 화면 판(설치형) · 1 = 호스트·받침 · 2 = 서버 연결 · 3 = 서버 · 4 = 바닥(공용 순수 모듈). */
export type Tier = 0 | 1 | 2 | 3 | 4

export interface BpModule {
  /** 설계 ① 에 적힌 이름 그대로(폴더·꾸러미 이름). */
  id: string
  /** 처음 보는 사람용 뜻. */
  title: string
  /** 어떤 종류인가 — 판(설치형) · 받침(늘 설치) 등. */
  kind: string
  tier: Tier
  /** 무엇을 하나(한두 문장). */
  does: string
  /** 들어가는 것. */
  inputs: string
  /** 나오는 것. */
  outputs: string
  /** 주요 파일·폴더. */
  files: string[]
  /** 연결된 판(태스크) 번호 — 설계 ① 16절 · ③ F 판. 현황판 일감의 P 번호와 맞춰 상태·캐릭터를 얹는다. */
  tasks: string[]
  /** 설계 ① 의 절. */
  sections: string[]
}

/** 화살표 — from 이 to 를 쓴다(화살 끝 = 내주는 쪽). label = 오가는 것. */
export interface BpEdge { from: string; to: string; label: string }

/** 설계 ① 모듈 이름 목록 — 시험이 BP_MODULES 와 1:1 로 대조한다. */
export const DESIGN_MODULES = ['v1-editor', 'ops-sub', 'ops-days', 'ops-room', 'ops-aux', '코어 5', 'account-server', 'ops-check', 'server-link', 'supabase/', 'shared/'] as const

export const BP_OVERVIEW: string[] = [
  '1.2v 는 v2 화면 틀(코어 5) 위에 학교 업무 판 다섯 — 편성 · 보결 · 학사 · 특별실 · 근태 — 을 「설치형 꾸러미」로 얹은 앱이다. 학교가 설치한 판만 화면에 나온다.',
  '판들은 서버에 직접 닿지 않는다. 자료 칸(doc · aux · rooms 등)을 읽고 쓰는 길은 전부 server-link 한 곳을 지나 Supabase 서버로 간다.',
  '서버는 칸을 열어 판정하고 닫아서 저장한다 — 역할 · 판 번호(If-Match) · 꼴 검사를 통과해야 쓰이고, 어긋나면 412 · 400 으로 돌려보낸다.',
  '판정 함수(꼴 검사 · 권한표 · 보결 엔진 · 특별실 규칙 · 보조 배정)는 맨 아래 shared/ 한 벌을 화면과 서버가 같이 쓴다 — 같은 규칙이 두 군데로 갈리지 않게.',
  '계정(account-server) · 데이터 검사(ops-check) · 서버 연결(server-link)은 늘 설치되는 받침 셋이다. 그림은 위가 사람이 만지는 판, 아래로 갈수록 바닥 모듈이다.',
]

export const BP_MODULES: BpModule[] = [
  {
    id: 'v1-editor', title: '편성 — 시간표 짜기', kind: '판 · 설치형', tier: 0,
    does: '선생님 v1 편성기를 고치지 않은 사본(legacy 패치 0)으로 iframe 에 띄워 학교 시간표(doc 칸)를 짜게 한다. 관리자가 아닌 사람에겐 반 × 교시 읽기 격자를 따로 보인다.',
    inputs: 'doc 칸(server-link 로컬 사본) · 가져온 v1 파일(ops-check 판별 뒤) · 부모 화면 밝기',
    outputs: 'doc 칸 PUT(고친 것을 2초 모아) · v1 파일 내려받기(선생님 앱 호환) · 인쇄',
    files: ['src/plugins/v1-editor/entry.ts', 'v1-editor/bundle-platform.ts', 'v1-editor/replace.tsx', 'v1-editor/grid/', 'v1-editor/legacy/'],
    tasks: ['P10a', 'P10b', 'P10c', 'P10d', 'P10e'], sections: ['2-1 v1 편성기', '2-0 노드 컴포넌트', '12 끊김'],
  },
  {
    id: 'ops-sub', title: '보결', kind: '판 · 설치형', tier: 0,
    does: '교사가 빠진 날의 보결 줄(sub_slot)을 목록·내 것·등록·상세·관리 화면으로 다룬다. 후보 계산과 판정은 서버가 shared/ 보결 엔진으로 한다.',
    inputs: '보결 행 · 서버가 계산한 후보 · 내 personRef·역할(account-server) · 학사 칸(ops-days — requires)',
    outputs: '보결 등록·맡기·취소 요청 · 「내 것」 목록(모바일 첫 판)',
    files: ['src/plugins/ops-sub/list/', 'ops-sub/register/', 'ops-sub/detail/', 'ops-sub/admin/'],
    tasks: ['P15', 'P16', 'P17', 'P18'], sections: ['5 보결', '10 후보 계산 입력'],
  },
  {
    id: 'ops-days', title: '학사', kind: '판 · 설치형', tier: 0,
    does: '학사 일정 · 시간표 변경 · 고정 일정 · 담임 과목 네 칸을 고친다. 보결과 근태가 둘 다 읽는 자료라 어느 한 판에 두지 않고 따로 뺐다.',
    inputs: '학사 칸 넷 · 담임 과목 파일(hwp · hwpx · xlsx · CSV)',
    outputs: '칸 넷 PUT → 보결 · 근태 · 읽기 격자가 읽는다',
    files: ['src/plugins/ops-days/', 'ops-days/import/'],
    tasks: ['P21', 'P25'], sections: ['2 판 배치', '3 자료 꼴'],
  },
  {
    id: 'ops-room', title: '특별실', kind: '판 · 설치형', tier: 0,
    does: '특별실 방 목록 · 주간표 · 빈 방 · 내 예약과 방 관리를 맡는다. 칸 규칙은 shared/room-rules 한 벌을 화면 그림과 서버 판정이 같이 쓴다.',
    inputs: 'rooms 칸 · 예약 행(room_reservation) · 내 personRef · 고정 사용 파일',
    outputs: '예약 행 쓰기 · rooms 칸 PUT(방 관리)',
    files: ['src/plugins/ops-room/', 'ops-room/manage/', 'ops-room/import/', 'shared/room-rules.ts'],
    tasks: ['P19', 'P20', 'P26'], sections: ['6 특별실'],
  },
  {
    id: 'ops-aux', title: '근태 — 보조 인력', kind: '판 · 설치형', tier: 0,
    does: '보조 인력 명부 · 기본 배정 · 날짜별 달력 · 월 합계 · 마감을 맡는다. 배정 검사와 추천은 shared/aux-engine 이 한다.',
    inputs: 'aux 칸 · 학사 칸(달력에 읽기로 얹음)',
    outputs: 'aux 칸 PUT · 상태바 배지 「14일 안 재배정 필요 n건」',
    files: ['src/plugins/ops-aux/', 'ops-aux/month/', 'shared/aux-engine/'],
    tasks: ['P22', 'P23'], sections: ['7 근태'],
  },
  {
    id: '코어 5', title: '화면 틀 — v2 호스트', kind: '코어 · 늘 설치', tier: 1,
    does: 'v2 의 설정 · 탐색기 · 선택 · 속성 · 아이콘 묶음 다섯. 학교 설치 목록에 든 꾸러미만 깨우고(activateAll), 노드에 「기능 붙이기」(컴포넌트)를 단다.',
    inputs: '학교 설치 목록(installed) · 꾸러미 매니페스트(views · components · requires)',
    outputs: '판(뷰)이 뜨는 자리 · 탐색기 노드 · 「기능 붙이기」 단추',
    files: ['src/main.tsx', 'src/app/plugins.ts', 'site.config.json', 'layout/mobile.ts'],
    tasks: ['P0', 'P1', 'P24'], sections: ['1 저장소 자리', '2 판 배치', '2-0 노드 컴포넌트'],
  },
  {
    id: 'account-server', title: '계정', kind: '받침 · 늘 설치', tier: 1,
    does: '가입(초대 코드) · 프로젝트 만들기 · 내 정보 · 구성원 · 역할을 맡는다. v2 account 자리에 같은 약속 이름(identity · permit · credential)으로 갈아 낀다.',
    inputs: '로그인 세션 · API(server-link — 계정 판은 fetch 를 직접 안 한다)',
    outputs: 'identity.current()(역할 · personRef) · permit.can() → 판들이 버튼을 가린다(막는 건 서버)',
    files: ['src/plugins/account-server/'],
    tasks: ['F2', 'F3', 'F4', 'F5', 'F6'], sections: ['11-2 account-server', '9 사람 id 넷'],
  },
  {
    id: 'ops-check', title: '데이터 검사', kind: '받침 · 늘 설치', tier: 1,
    does: '가져온 파일과 doc 칸의 데이터 꼴을 자동으로 검사해 결과 판에 보인다. 서버의 칸 PUT 도 같은 규칙(shared/check)을 불러 같은 규칙 id 로 돌려준다.',
    inputs: 'doc 칸 · 가져온 파일',
    outputs: '규칙 id 붙은 결과(doc.spec-missing 꼴) · 통과해야 「파일로 바꾸기」가 이어진다',
    files: ['src/plugins/ops-check/', 'shared/check/'],
    tasks: ['P4'], sections: ['11-3 ops-check', '3 자료 꼴'],
  },
  {
    id: 'server-link', title: '서버 연결', kind: '받침 · 늘 설치', tier: 2,
    does: '서버 연결 · 로그인을 한 곳에서 맡는다. supabase 클라이언트를 여기서만 만들고(구조 검사), 칸을 로컬 사본으로 두고 PUT 큐 · 412 충돌 · 끊김 잠금을 처리한다.',
    inputs: 'site.config.json(supabaseUrl · anonKey) · 판들이 쓴 칸',
    outputs: '칸 GET · PUT(If-Match 판 번호) · 상태바 연결 상태 · 로그인 · 412 버튼 둘',
    files: ['server-link/cache.ts', 'server-link/parts.ts', 'server-link/conflict-doc.tsx', 'server-link/replay.ts', 'server-link/offline.tsx'],
    tasks: ['P5', 'P6', 'P7', 'P8', 'P9', 'F1'], sections: ['11-1 server-link', '12 끊김'],
  },
  {
    id: 'supabase/', title: '서버 — Edge Functions', kind: '서버', tier: 3,
    does: '칸을 열어 판정하고 닫아서 저장한다. PUT 은 역할 검사 → 판 번호 → 꼴 검사 → 칸별 규칙 순서로 받고, 그날 보결 입력을 조립해 후보를 계산한다.',
    inputs: '칸 GET · PUT · 로그인 세션(Supabase Auth)',
    outputs: '200 · 412(판 어긋남) · 400(규칙 id) · 409(마감·예약 있는 방) · 보결 후보',
    files: ['supabase/functions/parts/', 'supabase/functions/_shared/day/', 'supabase/functions/_shared/crypto-scope.ts', 'supabase/migrations/'],
    tasks: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'], sections: ['8 서버가 하는 일', '10 후보 계산 입력'],
  },
  {
    id: 'shared/', title: '공용 판정 모듈', kind: '바닥 · 순수 TS', tier: 4,
    does: '화면과 서버가 똑같이 import 하는 순수 함수 한 벌이다. 같은 판정이 브라우저와 서버 두 군데로 갈리지 않게 한다.',
    inputs: '없음 — 자료를 인자로 받는 순수 함수(저장 · 통신 안 함)',
    outputs: '덩어리 판별(bundle) · 꼴 검사(check) · 권한표(roles) · 시각 변환(clock) · 보결 엔진 · 보조 배정 엔진 · 특별실 칸 규칙 · 표 불러오기(import)',
    files: ['shared/bundle/sniff.ts', 'shared/check/', 'shared/roles.ts', 'shared/clock.ts', 'shared/sub-engine/', 'shared/aux-engine/', 'shared/room-rules.ts', 'shared/import/'],
    tasks: ['P2', 'P3', 'P11', 'P12', 'P13', 'P14'], sections: ['1 가지 안 폴더', '16 판 쪼개기'],
  },
]

export const BP_EDGES: BpEdge[] = [
  { from: 'v1-editor', to: 'ops-check', label: '가져온 파일 판별' },
  { from: 'v1-editor', to: 'server-link', label: 'doc 칸 PUT' },
  { from: 'ops-sub', to: 'account-server', label: '역할 · personRef' },
  { from: 'ops-sub', to: 'ops-days', label: '학사 칸 읽기' },
  { from: 'ops-sub', to: 'server-link', label: '보결 행 · 후보' },
  { from: 'ops-days', to: 'server-link', label: '학사 칸 넷 PUT' },
  { from: 'ops-room', to: 'server-link', label: 'rooms 칸 · 예약 행' },
  { from: 'ops-room', to: 'shared/', label: '특별실 칸 규칙' },
  { from: 'ops-aux', to: 'ops-days', label: '학사 칸 읽기' },
  { from: 'ops-aux', to: 'server-link', label: 'aux 칸 PUT' },
  { from: 'ops-aux', to: 'shared/', label: '배정 검사 · 추천' },
  { from: 'v1-editor', to: '코어 5', label: '시간표 노드에 붙음' },
  { from: 'account-server', to: 'server-link', label: '로그인 세션 · API' },
  { from: 'ops-check', to: 'shared/', label: '꼴 검사 규칙' },
  { from: 'server-link', to: '코어 5', label: '상태바 · 로그인 판' },
  { from: 'server-link', to: 'supabase/', label: '칸 GET · PUT(If-Match)' },
  { from: 'server-link', to: 'shared/', label: '덩어리 꼴 · 시각' },
  { from: 'supabase/', to: 'shared/', label: '판정 함수 import' },
]
