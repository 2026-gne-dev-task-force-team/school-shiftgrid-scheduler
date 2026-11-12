import { layer1 } from './layer1-glance.ts'
import { layer2 } from './layer2-branches.ts'
import { layer3 } from './layer3-lanes.ts'
import { layer4 } from './layer4-workshop.ts'
import { layer5 } from './layer5-blueprint.ts'
import { inbox } from './inbox.ts'
import { sprints } from './sprints.ts'
import { guide } from './guide.ts'
import type { LayerRenderer } from './types.ts'

// 탭 설명 — 「무엇을 보여 주나 · 언제 보나」 한 줄. 탭 버튼 title·aria-describedby 와 본문 맨 위 부제가 이걸 쓴다.
const DESC: Record<string, string> = {
  layer1: '지금 스프린트가 얼마나 됐는지, 누가 일하는지, 최근 소식을 한 화면에 모았습니다. 처음 열면 여기부터 보세요.',
  layer2: '일마다 따로 뻗은 코드 가지가 언제 생기고 줄기에 합쳐졌는지 깃 그래프로 봅니다. 어떤 일이 아직 따로 진행 중인지 궁금할 때 봅니다.',
  layer3: '일감이 가는 길마다 누가 맡았고 남은 일감이 몇 개인지 봅니다. 어느 길이 막혔는지 볼 때 봅니다.',
  layer4: '일감 카드가 확인 중 · 기다림 · 작업 · 끝 중 어디 있는지, 몇 분째인지 봅니다. 무엇이 밀렸는지 볼 때 봅니다.',
  layer5: '앱을 집(큰 부분)과 방(작은 부분)으로 나눠 무엇을 지었고 무엇을 짓는 중인지 봅니다. 앱이 얼마나 갖춰졌는지 볼 때 봅니다.',
  sprints: '스프린트(일을 묶은 한 바퀴)마다 목표 · 기간 · 진행률 · 검수 결과를 봅니다. 지난 바퀴가 어떻게 끝났는지 볼 때 봅니다.',
  inbox: '[불편 접수]로 남긴 불편이 모이는 곳입니다. 내가 남긴 불편이 받아졌는지 볼 때 봅니다.',
  guide: '이 현황판이 무엇이고 각 층이 무엇을 보여 주는지 설명합니다. 처음 쓰거나 헷갈릴 때 봅니다.',
}

export const LAYERS: LayerRenderer[] = [layer1, layer2, layer3, layer4, layer5, sprints, inbox, guide]
  .map((l) => ({ ...l, desc: DESC[l.id] }))
