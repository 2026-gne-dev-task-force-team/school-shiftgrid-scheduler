// 태스크 꼬리표(R73) — 「대상」 한 칸을 규칙표(정규식 → 대상)로 뽑는다. 유형은 새로 안 만든다: 이미 있는 kind(결함·기능·설계·검수) 그대로.
// 못 뽑으면 「미분류」 — 짐작해 아무 칸에 넣지 않는다. 규칙은 이 한 곳에만 모은다(시험: tags.test.ts 가 줄마다 1건).
export const TARGETS = ['현황판', '1.2v 앱', 'v1', 'v2', '장치', '검수']
export const UNSORTED = '미분류'

const word = (w) => `(?<![\\w.])${w}(?![\\w.])`
// v1 만 있고 v2 가 없을 때만 v1 (둘 다 적혀 있으면 어느 쪽인지 모른다 → 다음 규칙/미분류)
const only = (a, b) => new RegExp(`^(?=.*${word(a)})(?!.*${word(b)})`, 's')

/** 글(id·종류 칸·제목) 규칙 — 위에서부터 첫 일치. 앞에 둘수록 센 단서(장치 낱말은 「현황판」 낱말보다 앞). */
export const CONTENT_RULES = [
  [/훅|보고꾼|문지기|감독관|순찰|장치|hook/i, '장치'],
  [/1\.2v\s*(앱|구현)|시간표\s*앱|(?:^|\s)앱\s|(?:^|\s)앱$|(?<![\w])P\d{1,2}[a-z]?(?![\w])/, '1.2v 앱'],
  [/현황판|Board|Blueprint|Inbox|Overview|Lanes|가지 그래프|작업장|캐릭터|스프린트|^📊|(?:^|\s)📊/, '현황판'],
  [only('v1', 'v2'), 'v1'],
  [only('v2', 'v1'), 'v2'],
  [/검수|검사|재검|QA|회귀/i, '검수'],
]
/** 요청함 「종류」 칸 전용 — 이모지로 적힌 유형 머리(👀 · 🔍)는 검수 일감. */
export const TYPE_CELL_RULES = [[/^\s*(👀|🔍)/u, '검수']]
/** 표의 「팀」 칸(분류) → 대상. */
export const CATEGORY_RULES = [[/^검사$/, '검수']]
/** 레인 이름 → 대상. 글에서 못 뽑았을 때만 쓴다. */
export const LANE_RULES = [
  [/현황판/, '현황판'],
  [/검수/, '검수'],
  [only('v1', 'v2'), 'v1'],
  [only('v2', 'v1'), 'v2'],
]

const first = (rules, s) => { for (const [re, t] of rules) if (re.test(s ?? '')) return t; return null }

/** 한 태스크의 대상. 글 → 종류 칸 → 분류 칸 → 레인 이름 순으로 보고 첫 단서를 쓴다. 단서 없으면 「미분류」. */
export function targetOf({ id = '', title = '', type = '', category = '', lane = '' } = {}) {
  return first(CONTENT_RULES, `${id} ${title}`) ?? first(CONTENT_RULES, type) ?? first(TYPE_CELL_RULES, type) ?? first(CATEGORY_RULES, category) ?? first(LANE_RULES, lane) ?? UNSORTED
}

const KIND_ORDER = ['bug', 'work', 'cr', 'review', 'decide']
const KIND_NAME = { bug: '결함', work: '기능', cr: '설계', review: '검수', decide: '결정' }
/** 분류표 — 대상 × 유형(kind) 개수. 줄 = 대상(미분류 맨 끝), 칸 = 유형. */
export function tagsTable(tasks) {
  const rows = [...TARGETS, UNSORTED].map((target) => ({ target, total: 0, ...Object.fromEntries(KIND_ORDER.map((k) => [k, 0])) }))
  const by = new Map(rows.map((r) => [r.target, r]))
  for (const t of tasks) {
    const r = by.get(t.target) ?? by.get(UNSORTED)
    r.total++
    r[KIND_ORDER.includes(t.kind) ? t.kind : 'work']++
  }
  return rows
}
/** 사람이 읽는 표 글(읽기 전용 — 값 없이 개수만). */
export function tagsReport(tasks) {
  const rows = tagsTable(tasks)
  const total = tasks.length
  const head = ['대상', ...KIND_ORDER.map((k) => KIND_NAME[k]), '합'].join('\t')
  const body = rows.map((r) => [r.target, ...KIND_ORDER.map((k) => r[k]), r.total].join('\t'))
  const un = rows.at(-1).total
  return [head, ...body, `합계 ${total} · 미분류 ${un} (${total ? Math.round((un / total) * 100) : 0}%)`].join('\n')
}
