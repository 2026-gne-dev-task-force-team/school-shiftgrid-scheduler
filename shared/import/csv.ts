/** 글자 꼴 판별 + 디코드. BOM → UTF-8 · 엄격 UTF-8 이 되면 UTF-8 · 아니면 EUC-KR(cp949). */
export function decodeText(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'euc-kr' } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.replace(/^﻿/, ''), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'euc-kr' }
  }
}

/** 구분자 추정 — 따옴표 밖 첫 줄에서 쉼표·탭·세미콜론 중 가장 많은 것(없으면 쉼표). */
export function guessDelimiter(text: string): string {
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0 }
  let q = false
  for (const ch of text) {
    if (ch === '"') q = !q
    else if (!q && (ch === '\n' || ch === '\r')) break
    else if (!q && ch in counts) counts[ch]++
  }
  return (['\t', ';'] as const).reduce((best, d) => (counts[d] > counts[best] ? d : best), ',')
}

/** RFC4180 꼴 CSV 파서 — 따옴표 속 구분자·줄바꿈·`""` 이스케이프. */
export function parseCsv(text: string, delimiter = guessDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const endCell = () => { row.push(cell); cell = '' }
  const endRow = () => { endCell(); rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === delimiter) endCell()
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow() }
    else if (ch === '\n') endRow()
    else cell += ch
  }
  if (cell !== '' || row.length > 0) endRow()
  return rows
}
