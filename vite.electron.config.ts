import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// Electron 빌드 전용 설정. 웹(Pages) 빌드는 vite.config.ts 가 그대로 맡는다 — 이 파일을 건드려도
// `npm run dev`/`npm run build`(웹)는 안 바뀐다.
//
//   렌더러  → dist-app/      (base: './' 유지 — file:// 로 그대로 열려야 한다)
//   main    → dist-electron/main.cjs
//   preload → dist-electron/preload.cjs
//
// main/preload 는 일부러 CJS(.cjs)로 고정한다. package.json 이 "type": "module" 이라 확장자를 안 박으면
// Electron 이 ESM 으로 읽으려 들고, sandbox 프리로드의 ESM 지원은 버전마다 갈려서 사고가 난다 — CJS면 그
// 걱정이 아예 없다. 타입 체크는 tsconfig.electron.json(`npx tsc -p tsconfig.electron.json --noEmit`)이 한다.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            // ⚠️ main 은 라이브러리 빌드(build.lib)라 rollupOptions.output.entryFileNames 는 무시된다.
            // 파일명·포맷은 반드시 lib.fileName/lib.formats 로 정한다.
            lib: { entry: 'electron/main.ts', formats: ['cjs'], fileName: () => 'main.cjs' },
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: { format: 'cjs', entryFileNames: 'preload.cjs' },
            },
          },
        },
      },
      // renderer 옵션은 일부러 안 쓴다 — 렌더러에 Node API를 안 열어야
      // contextIsolation:true·nodeIntegration:false·sandbox:true 가 뜻대로 산다.
    }),
  ],
  build: {
    outDir: 'dist-app',
  },
})
