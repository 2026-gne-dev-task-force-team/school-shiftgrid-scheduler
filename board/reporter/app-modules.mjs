// Blueprint 탭의 원천 — 시간표 앱(1.2v)의 집·방. 집 = 폴더 묶음, 방 = 그 집의 판(P 번호). 설계 원본은 「1.2v 설계 ① 통합 구조」 16절 판 쪼개기 초안.
// 상태는 요청함 R 줄의 상태 칸에서 읽는다(✅ 지음 · ◐🔄🔨 짓는 중 · 그 밖 계획). 공개 판이라 경로·기기·실명은 싣지 않는다(담백 검사가 막는다).

const DESIGN = '설계 ① 통합 구조'
const SECTION = '16절 판 쪼개기 초안'

// [집 id, 집 이름, [[판 번호, 방 이름, 요청함 번호 | null], …]]
export const APP_HOUSES = [
  ['app', '앱 뼈대', [['P0', '가지·배포', null], ['P1', '접두사·설치 목록', 'R43'], ['P24', '모바일', null]]],
  ['shared', 'shared 공용', [
    ['P2', '덩어리 판별', 'R44'], ['P3', '검사 규칙', 'R45'], ['P11', '시각·그날 입력', 'R52'], ['P12', '후보 엔진·대조 틀', 'R53'],
    ['P13a', '1,820 맞추기 앞 절반', 'R54'], ['P13b', '1,820 맞추기 뒤 절반·whyNot', 'R55'], ['P14', 'aux-engine·room-rules', 'R56'],
    ['P25', '담임 과목 불러오기', null],
  ]],
  ['check', 'ops-check 검사', [['P4', '검사 화면', 'R46']]],
  ['editor', 'v1-editor 편성기', [
    ['P10a', 'iframe 입구', 'R47'], ['P10b', 'platform 교체', 'R48'], ['P10c', '파일로 바꾸기', 'R49'], ['P10d', '읽기 격자', 'R50'], ['P10e', '보관 칸·기간', 'R51'],
  ]],
  ['link', 'server-link 서버 연결', [
    ['P5', '로컬 사본', 'R57'], ['P6', '칸 PUT 큐', 'R58'], ['P7', '412 버튼 둘', 'R59'], ['P8', '조작 재생', 'R60'], ['P9', '끊김 잠금·연결 상태', 'R61'],
  ]],
  ['sub', 'ops-sub 보결', [
    ['P15', '보결 목록·내 것', 'R62'], ['P16', '보결 등록', 'R63'], ['P17a', '보결 상세·맡기', 'R64'], ['P17b', '보결 취소', 'R65'], ['P18', '보결 관리', null],
  ]],
  ['room', 'ops-room 특별실', [['P19', '특별실 예약', 'R66'], ['P20', '방 관리·CSV', null], ['P26', '특별실 고정 사용 불러오기', null]]],
  ['days', 'ops-days 학사', [['P21', '학사 판', null]]],
  ['aux', 'ops-aux 근태', [['P22', '명부·배정·달력', null], ['P23', '월·마감', null]]],
  ['server', '서버 판정(D)', [
    ['D1', '그날 입력 조립', null], ['D2', '서버 오늘', null], ['D3', '보관 칸·판 고르기', null], ['D4', 'aux 칸 규칙', null], ['D5', 'rooms 칸 규칙', null], ['D6', '여는 범위·평문 0', null],
  ]],
]

/** 요청함 상태 칸 → 모듈 상태. */
export function moduleState(text) {
  const s = String(text ?? '')
  if (/^\s*✅/.test(s)) return 'built'
  if (/^\s*(◐|🔄|🔨)/u.test(s)) return 'build'
  return 'plan'
}

/**
 * requests: parseRequests 결과([{ id, state }]) · boardModules: 현황판 자기 모듈(readModules 결과).
 * 돌려주는 것: 앱 집·방 + 맨 끝 「현황판」 집 하나(자기 모듈은 방으로 편다).
 */
export function appModules(requests = [], boardModules = []) {
  const byR = new Map(requests.map((r) => [r.id, r]))
  const out = []
  for (const [hid, hname, rooms] of APP_HOUSES) {
    const root = `h-${hid}`
    const kids = rooms.map(([p, name, r]) => {
      const req = r ? byR.get(r) : null
      return { id: `m-${p.toLowerCase()}`, name: `${p} ${name}`, parent: root, state: req ? moduleState(req.state) : 'plan', task_id: req ? req.id : null,
        note: `${p}${r ? ` · ${r}` : ''} · ${DESIGN} ${SECTION}` }
    })
    const done = kids.filter((k) => k.state === 'built').length
    out.push({ id: root, name: hname, parent: null, state: done === kids.length ? 'built' : kids.some((k) => k.state !== 'plan') ? 'build' : 'plan', task_id: null, note: `${DESIGN} ${SECTION}` }, ...kids)
  }
  if (boardModules.length) {
    out.push({ id: 'h-board', name: '현황판', parent: null, state: 'built', task_id: null, note: '이 현황판 자체의 부품' },
      ...boardModules.filter((m) => m.parent).map((m) => ({ ...m, parent: 'h-board', note: '이 현황판 자체의 부품' })))
  }
  return out
}
