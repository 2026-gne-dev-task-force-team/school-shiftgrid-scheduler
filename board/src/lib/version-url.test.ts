import { describe, expect, it } from 'vitest'
import { versionUrl } from './version.ts'

describe('version.json 주소 — 지금 페이지 기준(포트·호스트를 박지 않는다)', () => {
  it('페이지 주소가 바뀌면 같이 바뀐다', () => {
    expect(versionUrl('http://localhost:4810/app/', 1)).toBe('http://localhost:4810/app/version.json?t=1')
    expect(versionUrl('https://x.example/school/v1.2/', 2)).toBe('https://x.example/school/v1.2/version.json?t=2')
  })
  it('코드에 5299 같은 고정 포트가 없다', () => {
    expect(versionUrl('http://localhost:4810/', 3)).not.toContain('5299')
  })
})
