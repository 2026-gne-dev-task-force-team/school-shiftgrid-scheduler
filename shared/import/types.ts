/** 표 읽기 공통 꼴 — hwp·hwpx·xlsx·CSV 넷이 같은 모양으로 들어온다(설계 ① P25). */
export type TableKind = 'csv' | 'xlsx' | 'hwpx' | 'hwp' | 'unknown'

export interface TableResult {
  kind: TableKind
  /** 문자열 2차원 — 앞뒤 공백 제거, 빈 줄 제거, 가로 길이는 가장 긴 줄에 맞춤 */
  rows: string[][]
  /** xlsx: 읽은 시트 이름 */
  sheet?: string
  /** xlsx: 전체 시트 이름(고르기용) */
  sheets?: string[]
  /** csv: 쓴 글자 꼴 */
  encoding?: 'utf-8' | 'euc-kr'
  warnings: string[]
}

export interface ReadOptions {
  /** 파일 이름(확장자 힌트) */
  name?: string
  /** xlsx 시트 · hwpx 표 — 이름 또는 0부터 번호. 기본 첫 것 */
  sheet?: string | number
}
