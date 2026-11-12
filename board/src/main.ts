import { mountBoard } from './embed.ts'
import { isInjected, readApp } from './lib/app.ts'
import { seedOpen } from './lib/drawer.ts'

// 첫 방문 서랍: 단독 실행(1.2v)은 열어 두고, v1·v2 에 주입된 자리(data-app)는 닫아 둔다. 저장값이 있으면 그 값.
// 진입점은 하나 — 배포가 board/vite.config.ts 의 기본 진입점 하나만 빌드하고, 갈림이 한 줄이라 따로 만들 값어치가 없다.
seedOpen(localStorage, isInjected(readApp()))
mountBoard()
