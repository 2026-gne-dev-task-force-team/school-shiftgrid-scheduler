// 채움 규칙 — 원천(레인 표·진행 로그·git)에 이미 있는데 안 싣던 세부를 빈칸에 채운다. 원천에 없는 것은 지어내지 않는다.
// 순수 함수만 둔다(파일·git 은 snapshot.mjs 가 읽어 넘긴다). 글은 모두 담백 거름(publicText)을 거친다.
import { publicText } from './plain.mjs'

const MARK = /[\p{Extended_Pictographic}\u{FE0F}]/gu
const hangul = (s) => (s.match(/[가-힣]/g) ?? []).length

/** 진행 로그 「결과」 칸 → 본문 후보(상태 기호만 걷고 거른 첫 줄들). 한글 4자 미만이면 빈 값 — 「머지」 한 낱말은 설명이 아니다. */
export function logBody(result, codeWord) {
  const t = publicText(String(result ?? '').replace(MARK, ''), codeWord).replace(/^[\s·—:,]+|[\s·—:,]+$/g, '')
  return hangul(t) >= 4 ? t : ''
}

/** 설명이 빈 태스크 → 그 일의 진행 로그 결과(가장 긴 것). 설명이 이미 있으면 그대로. */
export function bodyFromLog(task, hits, codeWord) {
  if (task.body) return task
  const best = hits.map((l) => logBody(l.result, codeWord)).sort((a, b) => b.length - a.length)[0]
  return best ? { ...task, body: best } : task
}

/** 설명이 빈 태스크 → 이어진 태스크(R↔T)의 설명을 빌린다. 이어진 것도 비었으면 그대로. 한 번만(체인으로 번지지 않게 원본 표를 본다). */
export function bodyFromLinks(tasks) {
  const by = new Map(tasks.map((t) => [t.id, t]))
  for (const t of tasks) {
    if (t.body || !t.links) continue
    const src = t.links.map((id) => by.get(id)).find((x) => x?.body)
    if (src) t.body = src.body
  }
  return tasks
}

/** 가지 제목 = 마지막 커밋 제목(거른 첫 줄, 40자 안). 비면 null. */
export function branchTitle(subject, codeWord) {
  const t = publicText(subject ?? '', codeWord).split('\n')[0]?.trim().slice(0, 40)
  return t && hangul(t) >= 2 ? t : null
}

/** 스프린트 검수·QA 칸 = 태스크 셈(원천: 레인 표 상태 칸). 태스크가 없으면 빈 값. */
export function sprintReview(mine) {
  if (!mine.length) return ''
  const done = mine.filter((t) => t.column === 'done').length
  const qa = mine.filter((t) => t.kind === 'review')
  const qaDone = qa.filter((t) => t.column === 'done').length
  const head = done === mine.length ? `태스크 ${mine.length}개 전부 완료` : `태스크 ${mine.length}개 중 ${done}개 완료`
  return qa.length ? `${head} · 검사 일 ${qa.length}개 중 ${qaDone}개 끝` : head
}

/** 다음엔 칸 = 이어지는 다음 스프린트 제목(있을 때만). */
export function sprintNext(sprints) {
  return sprints.map((s, i) => (sprints[i + 1] ? `다음 스프린트 — ${sprints[i + 1].title}` : ''))
}
