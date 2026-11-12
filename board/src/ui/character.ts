import type { Actor } from '../types.ts'
import { actorLabel } from '../lib/actor.ts'

// 캐릭터 = Claude Code 도트 마스코트(산호 몸통·검은 눈·옆 팔·다리 넷). 눈 칸 색·소품·머리띠 색만 다르다(눈 색↔기기 짝은 판에 안 싣는다).
type Who = Pick<Actor, 'name' | 'eye' | 'prop' | 'dept' | 'role' | 'state'>
export type CharSize = 'mini' | 'chip' | 'card'
const PX: Record<CharSize, number> = { mini: 27, chip: 36, card: 90 } // 가로 px — 격자 18×11 이라 한 칸 1.5~5px
const GW = 18, GH = 11

const BODY = '#D97757', INK = '#2B1710', PAPER = '#F3E6D3'
const EYE: Record<string, string> = { amber: '#F0A830', teal: '#2FBFAE', violet: '#A37BE0', blue: '#5B9BE8', green: '#7BC86C', rose: '#E86A8C' }
const PALETTE = Object.values(EYE)
const BAND: Record<string, string> = { hq: '#E0B341', make: '#2FBFAE', qa: '#A37BE0' }
const ROLE_PROP: Record<string, string> = { 지휘: 'flag', 살림: 'steth', 설계: 'ruler', 화면: 'brush', 자료: 'box', 시험: 'check', 맨눈: 'lens', 감독: 'scope' }
type R = [x: number, y: number, w: number, h: number, fill: string]
// 소품 = 몸 오른쪽(x14~16) 2~4칸 픽셀 물건
const PROPS: Record<string, R[]> = {
  flag: [[14, 3, 1, 6, INK], [15, 3, 2, 2, '#E5484D']],
  steth: [[14, 4, 3, 1, INK], [14, 5, 1, 2, INK], [16, 5, 1, 2, INK], [15, 7, 1, 1, '#9AA5AD']],
  ruler: [[15, 3, 2, 6, PAPER], [15, 4, 1, 1, INK], [15, 6, 1, 1, INK]],
  brush: [[16, 3, 1, 3, INK], [15, 6, 2, 2, '#5B9BE8']],
  box: [[14, 5, 3, 3, PAPER], [14, 6, 3, 1, '#C8A06A']],
  check: [[14, 3, 3, 5, PAPER], [14, 5, 1, 1, '#2F9E58'], [15, 6, 1, 1, '#2F9E58'], [16, 4, 1, 2, '#2F9E58']],
  lens: [[14, 4, 3, 3, '#BFE3F2'], [16, 7, 1, 1, INK]],
  scope: [[14, 2, 3, 1, INK], [13, 3, 1, 3, INK], [17, 3, 1, 3, INK], [14, 6, 3, 1, INK], [14, 3, 3, 3, '#BFE3F2'], [16, 7, 1, 1, INK], [15, 8, 1, 1, INK]], // 둥근 테 + 비스듬 손잡이
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
export function eyeColor(a: Pick<Actor, 'name' | 'eye'>): string {
  if (/^#[0-9a-f]{3,8}$/i.test(a.eye ?? '')) return a.eye
  return EYE[a.eye] ?? PALETTE[hash(a.name) % PALETTE.length]
}
export const propOf = (a: Pick<Actor, 'prop' | 'role'>): string | undefined => PROPS[a.prop] ? a.prop : ROLE_PROP[a.role]

const rect = ([x, y, w, h, f]: R) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`
const outline = ([x, y, w, h]: R) => rect([x - 1, y - 1, w + 2, h + 2, INK])

/** 같은 입력 → 같은 SVG 문자열(시험·정적 견본용). */
export function characterSvg(a: Who, size: CharSize = 'chip'): string {
  const eye = eyeColor(a), band = BAND[a.dept] ?? BAND.make, prop = propOf(a), px = PX[size]
  const sleepy = a.state === 'idle' || a.state === 'off' || a.state === 'done' // 쉼·퇴근 = 눈이 반쯤 감긴다(한 줄)
  const cls = (c: string, rs: R[]) => `<g class="${c}">${rs.map(rect).join('')}</g>`
  // 쉼 = 머리 옆 작은 Z · 막힘 = 머리 위 !(색은 CSS 변수가 입힌다)
  const mark = a.state === 'idle' ? cls('chr-z', [[12, -3, 3, 1, ''], [13, -2, 1, 1, ''], [12, -1, 3, 1, '']])
    : a.state === 'blocked' ? cls('chr-bang', [[6, -4, 2, 3, ''], [6, 0, 2, 1, '']]) : ''
  const shell: R[] = [[3, 1, 8, 1, band], [2, 2, 10, 6, BODY], [1, 4, 1, 2, BODY], [12, 4, 1, 2, BODY], ...(prop ? PROPS[prop] : [])]
  const legs = (xs: number[]) => xs.map((x): R => [x, 8, 1, 2, BODY])
  const eyes = (x: number) => sleepy ? [[x, 5, 2, 1, INK] as R] : [[x, 4, 2, 2, INK] as R, [x, 4, 1, 1, eye] as R]
  const leg = (cls: string, xs: number[]) => `<g class="${cls}">${legs(xs).map(outline).join('')}${legs(xs).map(rect).join('')}</g>`
  return `<svg class="chr" data-state="${a.state}" data-size="${size}" role="img" aria-label="${esc(actorLabel(a))}" width="${px}" height="${Math.round(px * GH / GW)}" viewBox="0 0 ${GW} ${GH}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">` +
    `<g class="chr-b">${shell.map(outline).join('')}${leg('chr-l1', [3, 8])}${leg('chr-l2', [5, 10])}${shell.map(rect).join('')}` +
    `<g class="chr-e">${[4, 8].flatMap(eyes).map(rect).join('')}</g></g>${mark}</svg>`
}

export function character(a: Who, size: CharSize = 'chip'): Element {
  const t = document.createElement('template')
  t.innerHTML = characterSvg(a, size)
  return t.content.firstElementChild!
}
