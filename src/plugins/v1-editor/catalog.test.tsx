// @vitest-environment node
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { activateAll, listPlugins } from '../../pane-ui-system/plugin'
import { getView } from '../../pane-ui-system/view-registry'
import { listCommands, runCommand, setWorkspaceBridge } from '../../pane-ui-system/plugin/store'
import { listRibbonActions } from '../../pane-ui-system/plugin/store'
import { PLUGINS } from '../../app/plugins'
import type { ComponentType } from 'react'

// T-8p8(R51) — 앱 카탈로그에 올린 v1-editor 의 화면이 실제 PLUGINS 활성 뒤 뷰 등록소에서 열린다(렌더 시험 수준).
const mem = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => { mem.set(k, String(v)) },
      removeItem: (k: string) => { mem.delete(k) },
      clear: () => { mem.clear() },
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() { return mem.size },
    },
  })
}
beforeEach(() => { mem.clear() })

describe('v1-editor 카탈로그 등록', () => {
  it('활성되고 화면 grid·versions 가 뷰 등록소에서 렌더된다', () => {
    activateAll(PLUGINS)
    const p = listPlugins().find((x) => x.id === 'v1-editor')
    expect(p?.enabled).toBe(true)
    expect(p?.failed).toBeFalsy()
    const grid = getView('v1-editor.grid')
    const versions = getView('v1-editor.versions')
    expect(getView('v1-editor.edit')).toBeTruthy()
    expect(grid).toBeTruthy()
    expect(versions).toBeTruthy()
    const html = (C: ComponentType<never>) => renderToStaticMarkup(createElement(C as ComponentType<object>))
    expect(html(grid!.Component as ComponentType<never>)).toContain('불러온 시간표가 없습니다')
    expect(html(versions!.Component as ComponentType<never>)).toContain('불러온 시간표가 없습니다')
  })

  it('열기 명령 셋이 팔레트 목록에 있고 레일에 편성기 아이콘이 선다', () => {
    activateAll(PLUGINS)
    const cmds = listCommands().filter((c) => c.owner === 'v1-editor')
    expect(cmds.map((c) => c.title).sort()).toEqual(['v1 편성기 열기', '판·적용 기간 열기', '시간표 읽기 격자 열기'].sort())
    for (const c of cmds) expect(typeof c.run).toBe('function')
    expect(listRibbonActions().some((a) => a.label === 'v1 편성기 열기')).toBe(true)
  })

  it('명령을 실행하면 해당 뷰를 가운데에 연다', () => {
    activateAll(PLUGINS)
    const opened: string[] = []
    setWorkspaceBridge({ open: (id) => { opened.push(id); return 'leaf' }, close() {}, setTitle() {} })
    opened.length = 0
    try {
      for (const c of ['edit', 'grid', 'versions']) runCommand(`v1-editor.open-${c}`)
    } finally { setWorkspaceBridge(null) }
    expect(opened).toEqual(['v1-editor.edit', 'v1-editor.grid', 'v1-editor.versions'])
  })
})
