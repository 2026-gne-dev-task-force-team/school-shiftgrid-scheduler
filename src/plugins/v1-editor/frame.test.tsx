// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addCommand } from '../../pane-ui-system/plugin/store'
import { setPlatform } from '../../pane-ui-system'
import { attachFrameKeys } from './frame'

const ran: string[] = []
const spy = (id: string) => ({ id, title: id, keys: id === 'p' ? 'Mod+K' : 'Mod+Z', run: () => void ran.push(id) })
const make = () => {
  const f = document.createElement('iframe')
  document.body.appendChild(f)
  return { f, off: attachFrameKeys(f), win: f.contentWindow as Window }
}
const key = (win: Window, init: KeyboardEventInit) => {
  const e = new (win as unknown as typeof globalThis).KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  win.document.body.dispatchEvent(e)
  return e
}
afterEach(() => { ran.length = 0; document.body.innerHTML = '' })

describe('v1 편성 iframe 키 넘기기', () => {
  it('⌘K 는 바깥 팔레트 명령을 부르고 ⌘Z·Enter·글자는 안 부른다', () => {
    setPlatform('mac')
    const d1 = addCommand('t', spy('p') as never)
    const d2 = addCommand('t', spy('z') as never)
    const { win, off } = make()
    const e = key(win, { key: 'k', code: 'KeyK', metaKey: true })
    expect(ran).toEqual(['p'])
    expect(e.defaultPrevented).toBe(true)
    key(win, { key: 'z', code: 'KeyZ', metaKey: true })
    key(win, { key: 'Enter', code: 'Enter' })
    key(win, { key: 'a', code: 'KeyA' })
    expect(ran).toEqual(['p'])
    off(); d1.dispose(); d2.dispose()
  })
  it('한글 조합 중 ⌘K 는 안 넘긴다', () => {
    setPlatform('mac')
    const d = addCommand('t', spy('p') as never)
    const { win, off } = make()
    key(win, { key: 'k', code: 'KeyK', metaKey: true, isComposing: true })
    expect(ran).toEqual([])
    off(); d.dispose()
  })
  it('Esc 는 v1 이 안 막았을 때만 바깥에 간다', () => {
    const got = vi.fn()
    window.addEventListener('keydown', got)
    const { win, off } = make()
    key(win, { key: 'Escape', code: 'Escape' })
    expect(got).toHaveBeenCalledTimes(1)
    win.document.addEventListener('keydown', (e) => e.preventDefault(), true)
    key(win, { key: 'Escape', code: 'Escape' })
    expect(got).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', got); off()
  })
})
