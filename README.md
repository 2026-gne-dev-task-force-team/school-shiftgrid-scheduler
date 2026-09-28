# 시간표 짜기 (school-shiftgrid-scheduler)

초등학교 시간표를 짜는 Electron 앱. 설계·왜 만드는지·화면 흐름은 볼트의 「시간표 짜기 요구명세」가 원본이다(이 레포에는 없음).

- 사용법: [docs/사용설명서.md](docs/사용설명서.md) — 앱 안 「도움말(F1) → 사용 설명서」와 같은 파일이다
- 화면 낱말의 기준: `src/ui/help/terms.ts` (필수/권장 규칙 · 시간 틀 · 시안 · 담임 …). 새 문구는 이 사전의 말로 쓴다
- v0.2 (2026-09-28): 밝은 테마 기본(전환 가능) · 처음 안내(환영·코치마크·홈 다음 할 일·도움말 서랍·낱말 밑줄) · **담임은 반의 속성**(교사 명부에 넣지 않는다 · 시수표에서 「담임」) · 협력수업(함께 수업) · 교사/특별실 금지칸은 시각으로 저장 · 시수표 열 드롭다운 · 시수표 엑셀 왕복 · 사전 점검(못 푸는 시수표) · 파일 형식 v3(옛 파일은 열 때 자동 변환)

## 준비

```bash
npm install
```

## 웹으로 실행 (브라우저)

```bash
npm run dev        # http://localhost:5173
npm run build       # dist/ 에 정적 빌드 (GitHub Pages 등)
npm run preview     # build 결과 미리보기
```

## 데스크톱 앱으로 실행 (Electron)

```bash
npm run dev:app     # 개발 모드 — vite dev 서버 + Electron 창을 같이 띄운다
```

## 설치 파일 만들기

```bash
npm run build:app        # 렌더러(dist-app/) + main·preload(dist-electron/) 빌드만
npm run dist:mac         # macOS: dmg + zip (release/)
npm run dist:win         # Windows: nsis 설치본 + portable (release/)
npm run dist:dir         # 압축 안 한 실행 폴더만 (빠른 확인용)
```

⚠️ **서명 없음.** macOS는 첫 실행 시 "확인되지 않은 개발자" 경고가, Windows는 SmartScreen 경고가 뜬다.
Gatekeeper가 막으면 `우클릭 → 열기`로, SmartScreen은 `추가 정보 → 실행`으로 넘긴다. 관내 배포 시 같이 안내할 것.

맥에서 Windows 빌드를 크로스로 만들 때, 아이콘을 exe에 심는 과정(rcedit)이 실패하면 `wine`이 없어서다.
그럴 땐 Windows 컴퓨터에서 같은 명령(`npm run dist:win`)을 직접 돌린다.

## 검사

```bash
npm run lint       # oxlint
npm run test       # vitest
npx tsc -b --noEmit                          # 웹(src) 타입 체크
npx tsc -p tsconfig.electron.json --noEmit   # electron/ 타입 체크 (별도 tsconfig)
```

## 파일 형식

문서는 `.shiftgrid.json` 한 파일에 학교 하나를 통째로 담는다. 덮어쓰기 저장은 경로가 있을 때만 되고,
없으면 항상 「다른 이름으로 저장」 창이 뜬다 — 마지막 한 타는 사람이 친다.

## 구조 (누가 무엇을 고치나)

- `electron/` · `src/platform/` · `src/io/` · `vite.electron.config.ts` · `package.json`(scripts·build) — 껍데기(이 판)
- `src/types/` · `src/engine/` — 엔진
- `src/ui/` · `src/store/` · `src/App.tsx` — 화면

각 판은 자기 폴더만 고친다. `src/platform/types.ts`(Platform 계약)·`src/engine/api.ts`(엔진 계약)가 경계다.
