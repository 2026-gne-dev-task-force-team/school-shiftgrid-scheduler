// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { activateAll, disablePlugin, enablePlugin, listPlugins } from '../../pane-ui-system/plugin'
import { getView } from '../../pane-ui-system/view-registry'
import { PLUGINS as APP_PLUGINS } from '../../app/plugins'
import { v1EditorPlugin } from '.'
// U20 F12 판 1(T-10fz): 앱 목록에서 내렸다 — 이 꾸러미의 시험만 제 손으로 끼워 돈다(판 2 에서 폴더째 걷는다).
const PLUGINS = [...APP_PLUGINS, v1EditorPlugin]
import { storageKey } from '../../pane-ui-system/storage'

// T-10ec — v1-editor(옛 편성기)는 기본 꺼짐. 새 기기 꺼짐 / 쓰던 기기 켜짐 유지 / 켜기·끄기 왕복.
const mem = new Map<string, string>()
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
beforeEach(() => { mem.clear() })

const v1 = () => listPlugins().find((p) => p.id === 'v1-editor')!
const stored = () => JSON.parse(mem.get(storageKey('plugins'))!) as { disabled: string[]; enabled: string[]; kept: number }

describe('v1-editor 기본 꺼짐', () => {
  it('새 기기(저장소 없음)에선 꺼진 채 시작하고 화면이 안 선다', () => {
    activateAll(PLUGINS)
    expect(v1().enabled).toBe(false)
    expect(getView('v1-editor.edit')).toBeFalsy()
    expect(v1().name).toBe('v1 편성기(옛)')
  })

  it('쓰던 기기(plugins 키가 이미 있음)는 처음 한 번 켜진 채로 옮겨지고 두 번 옮기지 않는다', () => {
    mem.set(storageKey('plugins'), JSON.stringify({ disabled: ['bell'] }))
    activateAll(PLUGINS)
    expect(v1().enabled).toBe(true)
    expect(getView('v1-editor.edit')).toBeTruthy()
    expect(stored().kept).toBe(1)
    // 사용자가 끈 뒤 다시 시동해도 되살아나지 않는다
    disablePlugin('v1-editor')
    activateAll(PLUGINS)
    expect(v1().enabled).toBe(false)
  })

  it('쓰던 기기라도 이미 v1-editor 를 끈 기록이 있으면 꺼진 채 둔다', () => {
    mem.set(storageKey('plugins'), JSON.stringify({ disabled: ['v1-editor'] }))
    activateAll(PLUGINS)
    expect(v1().enabled).toBe(false)
  })

  it('켜기 → 화면 뜸 · 저장 → 다시 시동해도 켜짐 → 끄기 → 화면만 사라짐', () => {
    activateAll(PLUGINS)
    enablePlugin('v1-editor')
    expect(v1().enabled).toBe(true)
    expect(getView('v1-editor.edit')).toBeTruthy()
    expect(stored().enabled).toContain('v1-editor')
    activateAll(PLUGINS)
    expect(v1().enabled).toBe(true)
    disablePlugin('v1-editor')
    expect(v1().enabled).toBe(false)
    expect(getView('v1-editor.edit')).toBeFalsy()
    expect(stored().disabled).toContain('v1-editor')
    expect(stored().enabled).not.toContain('v1-editor')
    enablePlugin('v1-editor')   // 왕복
    expect(v1().enabled).toBe(true)
    expect(stored().disabled).not.toContain('v1-editor')
  })
})
