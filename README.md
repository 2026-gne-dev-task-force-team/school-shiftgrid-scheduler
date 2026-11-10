# school-shiftgrid-scheduler — v2 (새로 짓는 중)

> 학교 교육행정 업무 **네 가지를 앱 하나**로 담는다 — 시간표 편성 · 보결 · 특별실 예약 · 보조인력 근태.
> 바닥은 표가 아니라 **시간 축(캘린더)** 이다. 네 업무는 같은 캘린더를 다른 축으로 보는 것일 뿐이다.

| 브랜치 | 무엇 | 어디 뜨나 |
|---|---|---|
| `v1` | 🧊 **동결.** 선생님이 실제로 쓰시는 판(v0.3.3) | 사이트 **루트** |
| `main` | 🧊 「표가 먼저」 재설계판(v2.0.0-m2.0) — 참고용으로 떠 있다 | `/v2/` |
| **`v2`** | 🆕 **지금 짓는 자리** (2026-10-31 갈아엎음) | 아직 안 올린다 |

- 🔴 ⛔ **`v1` 브랜치는 건드리지 않는다** — 선생님이 쓰시는 실물이고, 그 주소가 바뀌면 안 된다.
- ⭐ 배포 방아쇠는 **`main`·`v1` 두 브랜치뿐**이다(`.github/workflows/`). `v2` 를 밀어도 배포는 돌지 않는다 — 새 판이 설 때 배선을 옮긴다.

---

## 폴더 — 제일 아래 「후라이팬」부터

**후라이팬** = 우리 UI 시스템의 이름이다(폴더 `src/pane-ui-system/`). 아래 층이 위 층을 받친다.

```
 ┌───────────────────────────────────────────────┐
 │ app/        조립 — 어떤 플러그인을 올릴지 고른다      │
 ├───────────────────────────────────────────────┤
 │ plugins/    꾸러미 (후라이팬 위에 올리는 것)           │
 │   범용 앱    노트(page) · sheet · collection · account │
 │   학교 도메인 시간표(timetable-grid) · calendar ·      │
 │             people · rooms · room-booking             │
 │   견본       pane-test                                │
 ├───────────────────────────────────────────────┤
 │ pane-ui-system/   ★ 후라이팬 (제일 아래)              │
 │   core/     기본 기능 9 = 「내부 코어 플러그인」        │
 │             settings · plugin-manager · explorer ·    │
 │             nodes · node-store · node-frame ·         │
 │             selection · properties · icon-pack-basic  │
 │   엔진      layout · shell · plugin · primitives ·    │
 │             theme · interactive …                     │
 └───────────────────────────────────────────────┘
```

| 층 | 무엇 | 비고 |
|---|---|---|
| 후라이팬 엔진 | 창틀·셸·플러그인 틀·부품·테마 | 도메인을 모른다 |
| 후라이팬 `core/` | 기본 기능 9개 | 겉은 플러그인으로 등록되지만 `core: true` 라 **끌 수 없다** (`CORE_PLUGINS`) |
| `plugins/` | 앱 기능 | 후라이팬만 쓴다. 끄고 켤 수 있다 |
| `app/` | 조립 | 위 둘을 엮는다 |

- 표시 이름은 **노트**(폴더·id 는 `page`) · **시간표**(폴더·id 는 `timetable-grid`) — id·저장 키는 그대로다.
- 부품(primitives) 사용법: `src/pane-ui-system/primitives/README.md`

```
public/             정적 파일 · PWA 아이콘
.github/workflows/  GitHub Pages 배포
```

⭐ **옛 코드는 브랜치가 창고다.** `v1`(엔진·솔버·엑셀 왕복·화면 전체) · `main`(「표가 먼저」 판)에 통째로 살아 있다 — 따로 박제해 두지 않는다. 볼 땐 브랜치를 바꾸거나 `git show main:src/v2/rows.ts` 처럼 꺼내 본다.

🔴 **옛 코드는 복사해 오는 게 아니라 보고 다시 짜는 것이다.**

## 돌리는 법

```bash
npm ci
npm run dev      # http://localhost:5173/
npm run build    # tsc -b && vite build
npm test         # vitest run
npm run lint     # oxlint
```

- React · TypeScript · Vite · Tailwind CSS · vitest · **oxlint** (⛔ prettier 안 쓴다 — 설정 파일이 없다)
- **PWA** — 폰 홈 화면에 붙이면 오프라인에서도 뜬다. 서버가 없다(전부 브라우저 안에서 돈다)
- ⛔ **Electron 은 2026-10-31 에 걷어냈다.** 웹·PWA 하나로 간다

## 설계·판정은 볼트가 원본이다

`프로젝트 리포트/시간표 짜기/` — **「시간표 짜기 v2 설계」** 가 원본이다. **코드를 쓰기 전에 읽는다.**
