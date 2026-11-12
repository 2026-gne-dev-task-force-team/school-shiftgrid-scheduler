import { mountBoard } from './embed.ts'
import { saveOpen } from './lib/drawer.ts'

// 단독 실행: 서랍을 처음부터 열어 둔다(저장된 값이 없을 때만).
if (localStorage.getItem('board.open') === null) saveOpen(localStorage, true)
mountBoard()
