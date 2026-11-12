import type { TableKind } from './types.ts'

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v)

const extKind = (name?: string): TableKind => {
  const m = /\.([a-z0-9]+)$/i.exec(name ?? '')
  switch (m?.[1].toLowerCase()) {
    case 'xlsx': case 'xlsm': return 'xlsx'
    case 'hwpx': return 'hwpx'
    case 'hwp': return 'hwp'
    case 'csv': case 'txt': case 'tsv': return 'csv'
    default: return 'unknown'
  }
}

/** 종류 판별 — 매직바이트가 먼저, 확장자는 텍스트(CSV) 보조. 던지지 않는다.
 *  zip(`PK`): 첫 항목 이름이 mimetype 이면 hwpx, 아니면 xlsx · OLE(`D0CF11E0`): hwp · NUL 이 든 그 외 바이너리: unknown. */
export function detectKind(bytes: Uint8Array, name?: string): TableKind {
  if (bytes.length === 0) return 'unknown'
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // zip 로컬 헤더: 30바이트 뒤부터 파일 이름. hwpx 는 첫 항목이 `mimetype`
    const head = new TextDecoder('latin1').decode(bytes.subarray(30, 30 + 8))
    return head === 'mimetype' ? 'hwpx' : 'xlsx'
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    // OLE 는 옛 xls·doc 도 같은 머리 — 확장자가 hwp 가 아니면 모르는 것으로
    const e = extKind(name)
    return e === 'hwp' || e === 'unknown' ? 'hwp' : 'unknown'
  }
  const probe = bytes.subarray(0, 4096)
  for (let i = 0; i < probe.length; i++) if (probe[i] === 0) return 'unknown'
  return 'csv'
}
