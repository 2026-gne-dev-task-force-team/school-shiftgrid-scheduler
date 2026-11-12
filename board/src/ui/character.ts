import type { Actor } from '../types.ts'
import { actorLabel } from '../lib/actor.ts'

// 캐릭터 = 모두 같은 테라코타 꼴. 눈 색·소품·머리띠 색만 다르다(눈 색↔기기 짝은 판에 안 싣는다).
type Who = Pick<Actor, 'name' | 'eye' | 'prop' | 'dept' | 'role' | 'state'>
export type CharSize = 'mini' | 'chip' | 'card'
const PX: Record<CharSize, number> = { mini: 18, chip: 24, card: 56 }

const BODY = '#D97757', SHADE = '#B85C3E', INK = '#4A2618', PAPER = '#F3E6D3'
const EYE: Record<string, string> = { amber: '#F0A830', teal: '#2FBFAE', violet: '#A37BE0', blue: '#5B9BE8', green: '#7BC86C', rose: '#E86A8C' }
const PALETTE = Object.values(EYE)
const BAND: Record<string, string> = { hq: '#E0B341', make: '#2FBFAE', qa: '#A37BE0' }
const ROLE_PROP: Record<string, string> = { 지휘: 'flag', 살림: 'steth', 설계: 'ruler', 화면: 'brush', 자료: 'box', 시험: 'check', 맨눈: 'lens' }
const P = `fill="${PAPER}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`
const PROPS: Record<string, string> = {
  flag: `<path d="M55 28V56" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M55.5 28.5L63 32.5L55.5 36.5Z" fill="#E5484D" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
  steth: `<path d="M50 30v6a5 5 0 0 0 10 0v-6" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><path d="M55 41v6" stroke="${INK}" stroke-width="1.8"/><circle cx="55" cy="50" r="3.4" ${P}/>`,
  ruler: `<rect x="52.5" y="28" width="7" height="27" rx="1.2" transform="rotate(12 56 41)" ${P}/><path d="M53 34h3M52.6 39h2M52.2 44h3M51.8 49h2" transform="rotate(12 56 41)" stroke="${INK}" stroke-width="1.1"/>`,
  brush: `<path d="M61 29L53.5 46" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M53.5 46c-2.5 1-3.5 4-4 8c3.5-1.5 6-3.5 6.5-6.5Z" fill="#5B9BE8" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
  box: `<rect x="49" y="41" width="13" height="12" rx="1.5" ${P}/><path d="M49 45h13M55.5 41v4" stroke="${INK}" stroke-width="1.1"/>`,
  check: `<rect x="49.5" y="33" width="12.5" height="17" rx="1.5" ${P}/><rect x="53" y="31.5" width="5.5" height="3" rx="1" fill="${INK}"/><path d="M52.5 42l2.5 2.5l4.5-5" fill="none" stroke="#2F9E58" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  lens: `<path d="M59.5 44.5L63 50" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="56" cy="40" r="5.2" fill="#BFE3F2" fill-opacity=".7" stroke="${INK}" stroke-width="1.8"/>`,
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
export function eyeColor(a: Pick<Actor, 'name' | 'eye'>): string {
  if (/^#[0-9a-f]{3,8}$/i.test(a.eye ?? '')) return a.eye
  return EYE[a.eye] ?? PALETTE[hash(a.name) % PALETTE.length]
}
export const propOf = (a: Pick<Actor, 'prop' | 'role'>): string | undefined => PROPS[a.prop] ? a.prop : ROLE_PROP[a.role]

/** 같은 입력 → 같은 SVG 문자열(시험·정적 견본용). */
export function characterSvg(a: Who, size: CharSize = 'chip'): string {
  const eye = eyeColor(a), band = BAND[a.dept] ?? BAND.make, prop = propOf(a), px = PX[size]
  const eyeOne = (x: number) => `<ellipse cx="${x}" cy="38" rx="5.2" ry="6.2" fill="${eye}" stroke="${INK}" stroke-width="1"/>` +
    `<circle cx="${x + .6}" cy="39" r="1.5" fill="${INK}"/><circle cx="${x + 1.6}" cy="36.2" r="1.3" fill="#fff"/>`
  // 쉼·끝 = 눈꺼풀이 반쯤 내려온다
  const lid = (x: number) => `<path d="M${x - 5.8} 38V31.2h11.6V38Q${x} 35.4 ${x - 5.8} 38Z" fill="${BODY}"/><path d="M${x - 5.2} 37.6Q${x} 35.2 ${x + 5.2} 37.6" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`
  const sleepy = a.state === 'idle' || a.state === 'done'
  return `<svg class="chr" data-state="${a.state}" data-size="${size}" role="img" aria-label="${esc(actorLabel(a))}" width="${px}" height="${px}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">` +
    `<ellipse cx="32" cy="59.5" rx="17" ry="2.6" fill="#000" fill-opacity=".28"/>` +
    `<g class="chr-b">` +
    `<ellipse cx="24" cy="55.5" rx="5.5" ry="3.2" fill="${SHADE}"/><ellipse cx="40" cy="55.5" rx="5.5" ry="3.2" fill="${SHADE}"/>` +
    `<ellipse cx="11.5" cy="41" rx="3.6" ry="5.4" fill="${SHADE}"/><ellipse cx="52.5" cy="41" rx="3.6" ry="5.4" fill="${SHADE}"/>` +
    `<path d="M32 11C46 11 52 23 52 37C52 50 44 56 32 56C20 56 12 50 12 37C12 23 18 11 32 11Z" fill="${BODY}"/>` +
    `<path d="M15.4 25Q32 17 48.6 25L50.6 30.4Q32 22.6 13.4 30.4Z" fill="${band}"/><path d="M49.6 27l6.2-4l-0.8 7.6Z" fill="${band}"/>` +
    eyeOne(25) + eyeOne(39) + (sleepy ? lid(25) + lid(39) : '') +
    `<path d="M29 47.5Q32 50 35 47.5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` +
    (prop ? `<g class="chr-p">${PROPS[prop]}</g>` : '') +
    `</g></svg>`
}

export function character(a: Who, size: CharSize = 'chip'): Element {
  const t = document.createElement('template')
  t.innerHTML = characterSvg(a, size)
  return t.content.firstElementChild!
}
