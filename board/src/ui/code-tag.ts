import { h } from '../dom.ts'
import { splitCode } from '../layers/layer5-logic.ts'

// 처음 보는 사람이 읽도록 — 뜻을 앞에, 번호·코드 이름은 작은 회색 꼬리표로 뒤에 둔다.
const tag = (code: string) => h('small', { class: 'bp-code' }, code)

/** 「P10a iframe 입구」 → [「iframe 입구」, 꼬리표 P10a]. 코드가 없으면 글만. */
export function named(name: string): (string | HTMLElement)[] {
  const { code, text } = splitCode(name)
  return code ? [text, tag(code)] : [text]
}

/** 「자료 싣기 · 성공 · 응답 201」 → 「자료 싣기 · 성공」 + 꼬리표 「응답 201」. 「 · 」 토막마다 앞 코드·응답 번호를 꼬리표로 민다. */
export function plainLog(line: string): (string | HTMLElement)[] {
  const out: (string | HTMLElement)[] = []
  const tags: string[] = []
  const keep: string[] = []
  for (const part of line.split(' · ')) {
    if (/^(?:응답|HTTP|status)\s*\d{3}$/i.test(part.trim())) { tags.push(part.trim()); continue }
    const { code, text } = splitCode(part)
    if (code) tags.push(code)
    keep.push(text)
  }
  out.push(keep.join(' · '))
  for (const t of tags) out.push(tag(t))
  return out
}

/**
 * 한 바퀴 이름 「현황판 품질 18:02 묶음 · 앱 1:2」 → 「현황판 품질 묶음」 + 꼬리표 「18:02」 「앱 1:2」.
 * 「묶음」 = 일을 묶어 한 바퀴로 돌린 단위. 「앱 1:2」 같은 앞 낱말 + 숫자:숫자 꼬리는 코드성이라 꼬리표로만 둔다(뜻은 코드에서 못 찾았다).
 */
export function wheelTitle(title: string): (string | HTMLElement)[] {
  const tags: string[] = []
  const keep: string[] = []
  for (const part of title.split(' · ')) {
    if (/^\S+\s*\d+:\d+$/.test(part.trim()) && keep.length) { tags.push(part.trim()); continue }
    const { code, text } = splitCode(part)
    if (code) tags.push(code)
    keep.push(text.replace(/\s*\b\d{1,2}:\d{2}\b/g, (m) => { tags.push(m.trim()); return '' }).replace(/\s{2,}/g, ' ').trim())
  }
  return [keep.filter(Boolean).join(' · '), ...tags.map(tag)]
}
