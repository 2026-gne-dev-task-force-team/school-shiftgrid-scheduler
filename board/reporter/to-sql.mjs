// 스냅숏(BoardData 꼴) → board 표를 통째로 갈아 끼우는 SQL 한 덩이. 의존성 없음(apply.mjs 에 그대로 붙는다).
// 표 이름은 아래 고정 목록만 쓴다(입력 키에서 안 받는다). feedback 은 사람이 쓰는 표라 건드리지 않는다.
export const TABLES = ['actors', 'tasks', 'lanes', 'branches', 'services', 'modules', 'goals', 'events', 'usage', 'runs', 'sprints']

export function toSql(snap) {
  const parts = ['begin;']
  for (const t of TABLES) {
    const rows = snap?.[t]
    if (!Array.isArray(rows)) throw new Error(`스냅숏에 ${t} 배열이 없다`) // 빈 표로 지우는 사고 막기
    const json = JSON.stringify(rows)
    if (json.includes('$snap$')) throw new Error(`${t} 에 $snap$ 이 들어 있다`)
    parts.push(`delete from board.${t};`,
      `insert into board.${t} select * from jsonb_populate_recordset(null::board.${t}, $snap$${json}$snap$::jsonb);`)
  }
  parts.push('commit;')
  return parts.join('\n')
}
