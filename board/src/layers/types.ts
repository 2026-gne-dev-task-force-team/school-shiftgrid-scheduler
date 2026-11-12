// 층 렌더러 인터페이스 — 층 2~5 판은 자기 파일(layerN-*.ts)의 render 하나만 채운다.
import type { BoardData } from '../types.ts'

export interface DetailContent { title: string; rows: [label: string, value: string][] }

export interface LayerCtx {
  data: BoardData
  /** 무대에서 무언가를 눌렀을 때 호출 — PC 는 오른쪽 칸, 폰은 바텀시트로 열린다. */
  openDetail(c: DetailContent): void
  /** 요소에 툴팁을 단다(PC 올리기 / 폰 길게 누르기). text 는 보일 때마다 불린다. */
  tip(el: HTMLElement, text: () => string): void
}

export interface LayerRenderer {
  id: string
  floor: 1 | 2 | 3 | 4 | 5
  tab: string
  /** host 안에 그린다. 정리 함수를 돌려주면 층을 떠날 때 불린다. 반짝일 물건엔 data-id 를 단다(로그 줄 누르면 반짝). */
  render(host: HTMLElement, ctx: LayerCtx): void | (() => void)
}
