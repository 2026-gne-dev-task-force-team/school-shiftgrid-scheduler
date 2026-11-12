import { h } from '../dom.ts'
import type { LayerRenderer } from './types.ts'

const SECTIONS: [string, string[]][] = [
  ['이 판은 무엇인가', ['시간표 앱을 만드는 작업이 어디까지 왔는지 한 화면에서 보여 주는 현황판입니다.']],
  ['구조', [
    '0층 띠 — 상태 · 진행률 · 남은 예상 · 한도와 속도',
    '1층 한눈 — 목표 · 부서별 인원 · 한도 · 최근 흐름',
    '2층 가지 — 코드 가지와 합쳐진 것',
    '3층 길 — 일감이 가는 길(레인)',
    '4층 작업장 — 기다림 · 하는 중 · 끝 칸의 일감 카드',
    '5층 설계도 — 서비스와 부품의 짜임',
  ]],
  ['작업이 어떻게 도나', ['접수 또는 백로그 → 검토·설계 → 구현 → 검수 → QA → 병합·배포']],
  ['누가 무엇을 하나', [
    '본부 — 일감을 나누고 합치고 기록한다',
    '제작부 — 설계대로 만든다',
    '품질부 — 검수하고 시험한다',
  ]],
  ['어디까지 가나', ['바퀴 1 목업 → 바퀴 2 진짜 자료 → 바퀴 3 실시간·알림 → 바퀴 4 앱 위 띠']],
]

export const guide: LayerRenderer = {
  id: 'guide', floor: 6, tab: '안내',
  render(host) {
    host.append(h('p', { class: 'card' }, h('b', null, '지금은 가짜 자료로 그린 목업입니다.')))
    for (const [title, lines] of SECTIONS) {
      host.append(h('section', { class: 'card' }, h('b', null, title), ...lines.map((l) => h('p', null, l))))
    }
  },
}
