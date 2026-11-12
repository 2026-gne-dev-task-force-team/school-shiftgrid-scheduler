/**
 * 읽기 격자 화면 — buildGrid 결과를 표로 그린다(편집 없음). 날짜 고르기·자료 가져오기는 바깥(P10d 뒤 붙임)이 맡는다.
 */
import { toHHMM } from '../../../../shared/clock'
import { buildGrid, type DayOverlay, type GridCell, type GridTable } from './model'
import type { Doc } from '../legacy/types/doc'

const STATUS_LABEL: Record<GridCell['status'], string> = { normal: '', homeroom: '', changed: '변경', sub: '보결', off: '없음', none: '' }

function Cell({ c }: { c: GridCell }) {
  if (c.status === 'none') return <td data-status="none" />
  if (c.status === 'off') return <td data-status="off">없음</td>
  return (
    <td data-status={c.status} title={c.startMin == null ? undefined : toHHMM(c.startMin) + '~' + toHHMM(c.endMin!)}>
      <div>{c.subject ?? ''}{c.was?.subject != null && <s> {c.was.subject}</s>}</div>
      <div>{[c.teacher, c.coTeacher].filter(Boolean).join(' · ')}{c.was?.teacher != null && <s> {c.was.teacher}</s>}{c.room ? ' @' + c.room : ''}</div>
      {STATUS_LABEL[c.status] && <b>{STATUS_LABEL[c.status]}</b>}
    </td>
  )
}

export function GridTableView({ table }: { table: GridTable }) {
  if (!table.ok) {
    const msg = table.reason === 'school-off' ? `학교 전체 쉼 — ${table.offReason}` : table.reason === 'weekend' ? '주말입니다' : '이 날짜에 적용되는 시간표가 없습니다'
    return <p role="status">{msg}</p>
  }
  return (
    <table aria-label={`${table.date} 시간표`}>
      <caption>{table.date} {table.timetableName ?? ''}</caption>
      <thead><tr><th>반</th>{table.periods.map((p) => <th key={p}>{p}교시</th>)}</tr></thead>
      <tbody>
        {table.rows.map((r) => (
          <tr key={r.trackId} data-off={r.off || undefined}>
            <th scope="row">{r.trackName}</th>
            {r.cells.map((c, i) => <Cell key={i} c={c} />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 문서 + 날짜 + 그날 변경 → 격자. 계산은 model.buildGrid 에 있다. */
export function TimetableGrid({ doc, date, overlay }: { doc: Doc; date: string; overlay?: DayOverlay }) {
  return <GridTableView table={buildGrid(doc, date, overlay)} />
}
