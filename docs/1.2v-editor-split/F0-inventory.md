# F0 실측 목록 — `v1-editor` 96파일 → 조각 → 갈 곳

> 판 T-10ea (요청함 U20·R126 「1.2v 편성기 분해 재구축」 F0). 읽기 판 — 코드는 안 고쳤다. 설계: 볼트 `1.2v 편성기 분해 재구축 설계` 1~5절.
> 기준: 레포 `school-shiftgrid-scheduler` 가지 `1.2v-preview` 02cf548 · `src/plugins/v1-editor/` · 줄 수는 `wc -l`(줄바꿈 수) 실측. 표는 스크립트로 뽑았고 스크립트는 커밋하지 않았다.

## 0. 한눈에

- 파일 **96** · 줄 합 **14,480** (`wc -l` 전체). 그중 시험 8파일 620줄. **시험 뺀 `.ts`/`.tsx` = 13,220줄** — 설계 1절의 13,220 과 정확히 같다(css 123줄·md 290줄·json·png 등은 그 숫자에 안 들어 있다).
- 표 행 147개(큰 파일은 줄 구간별로 나눔). **갈 곳 빈칸 0.** 🙋 6행(갈림길 셋: 편성 막힘 자료 3행 · 배치 정본 1행 · 판 기간 2행 — 3절 ④⑤).
- 갈래: 옮김(F1~F11) 34파일 · 레거시 플러그인에 남김(FL·F12) 18파일 · **버림 42파일 6,465줄** · 🙋 5파일.
- 「버림」은 지우는 게 아니라 **새 조각이 가져가지 않는다**는 뜻이다. 옛 편성기는 레거시 플러그인(FL)으로 통째 남는다(쥔님 11-17 11:16).

## 1. 파일 → 조각 → 갈 곳

갈 곳 표기: `F숫자` = 설계 4절 판 번호 · `정본 …` = 이미 있는 1.2v 플러그인이 정본(저장 꼴은 버림) · `버림: 이유` · `FL` = 레거시 플러그인에 그대로 남김 · `🙋` = 두 후보와 권하는 쪽.

| 파일 | 줄 | 조각(설계 3절 이름) | 갈 곳 |
|---|---:|---|---|
| `.gitattributes` | 2 | legacy/·docs/ 줄바꿈 고정 | FL 레거시와 함께 유지 |
| `bundle-platform.test.ts` | 32 | platform 어댑터 시험 | F10 v1-file 시험 재료 |
| `bundle-platform.ts` | 94 | `window.platform` 꾸러미 어댑터 + 메모리 DocStore | F10 v1-file 재료(설계 ① platform 9메서드 표) — 저장 자리 어댑터는 버림, 파일 입출력 부분만 재사용 |
| `catalog.test.tsx` | 63 | 레거시 겉옷 시험 | FL 레거시와 함께 유지 (기본 꺼짐 시험으로 고침) |
| `docs/사용설명서.md` | 290 | v1 사용설명서(도움말 원본 · legacy 가 import) | FL 레거시와 함께 유지 · 새 조각은 각자 `about`+사용 설명서가 맡음(버림) |
| `entry.ts` | 21 | 레거시 플러그인 겉옷(iframe 입구·신분증) | FL 레거시 `v1-editor` 로 유지(이름·about 만 바꿈) → F12 구조 검사 대상 |
| `frame.test.tsx` | 55 | 레거시 겉옷 시험 | FL 레거시와 함께 유지 (기본 꺼짐 시험으로 고침) |
| `frame.tsx` | 50 | 레거시 플러그인 겉옷(iframe 입구·신분증) | FL 레거시 `v1-editor` 로 유지(이름·about 만 바꿈) → F12 구조 검사 대상 |
| `grid/GridView.tsx` | 46 | 읽기 격자 화면 | 버림: 정본 `timetable-grid` 격자가 맡음 |
| `grid/index.ts` | 3 | 읽기 격자 배럴 | 버림: grid/ 와 함께 |
| `grid/model.test.tsx` | 130 | 읽기 격자 시험 | 버림: grid/ 와 함께 |
| `grid/model.ts` | 119 | 읽기 격자 모델 buildGrid(문서+그날 변경→칸 표) | 버림: 정본 `timetable-grid` + `shared/sub-engine/day-input` 이 같은 일을 함(「결과 격자 둘」 중복) |
| `index.ts` | 52 | 레거시 플러그인 겉옷(iframe 입구·신분증) | FL 레거시 `v1-editor` 로 유지(이름·about 만 바꿈) → F12 구조 검사 대상 |
| `legacy-engine-resource-pool.test.ts` | 120 | R106 정원·예약방 시험 | F1 시험(R54·R55 흡수와 함께) |
| `legacy-sync.mjs` | 89 | v1 가지 따라가기 스크립트 | F12 멈춤(스크립트 정지 · 파일은 레거시와 함께 남김) |
| `legacy.test.ts` | 83 | 레거시 겉옷 시험 | FL 레거시와 함께 유지 (기본 꺼짐 시험으로 고침) |
| `legacy/App.tsx` | 13 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/assets/hero.png` | 52 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/assets/react.svg` | 0 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/assets/vite.svg` | 1 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/engine/__fixtures__/small.ts` | 84 | 지어낸 작은 학교(엔진 시험용 Doc) | F1 시험 자료 — 정답 1,820 시험과 따로 둠(레포 샘플) |
| `legacy/engine/api.ts` | 223 | 엔진 약속 서명(문맥·진단·이동·사전 점검·솔버·수요 현황 타입 + 함수 목록) | F1 `contract-solver`(약속) — `Doc` 인자를 편성 입력으로 바꿈 |
| `legacy/engine/capacity.ts` | 121 | 특별실 정원 합산(R106) | F1 `timetable-solver` |
| `legacy/engine/context.ts` | 142 | buildContext(Doc→문맥·색인) | F1 `timetable-solver` 순수 색인 부분 · 입력 조립(정본 일곱에서)은 F5 가 새로 지음 |
| `legacy/engine/core.ts` | 17 | 엔진 진입 배럴 | F1 `timetable-solver` 진입점 |
| `legacy/engine/evaluate.ts` | 113 | evaluateAll·diagnose·demandStatus | F1 `timetable-solver` (F9 점검·F3 현황이 부름) |
| `legacy/engine/move.ts` | 161 | previewMove·applyMove·candidateCells(이동 판정) | F1 `timetable-solver` (F8 손으로 옮기기가 부름) |
| `legacy/engine/resource-pool.ts` | 54 | 예약만 받는 방 풀(R106) | F1 `timetable-solver` |
| `legacy/engine/rules.ts (1-116)` | 116 | 규칙 공용 함수(softFixable·specByGrade·gradeLunches·runsOf·agentDays·mkViol) | F2 편성 규칙 공용 모듈 |
| `legacy/engine/rules.ts (117-140)` | 24 | 규칙 no-overlap-track(hard) 같은 반 겹침 | F2 편성 규칙 기여 `no-overlap-track`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (141-170)` | 30 | 규칙 no-overlap-agent(hard) 교사 겹침 | F2 편성 규칙 기여 `no-overlap-agent`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (171-213)` | 43 | 규칙 no-overlap-resource(hard) 특별실 정원 초과 | F2 편성 규칙 기여 `no-overlap-resource`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (214-240)` | 27 | 규칙 blocked-cell(hard) 배정 불가 칸 | F2 편성 규칙 기여 `blocked-cell`(hard) — 규칙마다 시험 하나 · 막힘 자료는 F5 쪽 결정(🙋)을 따름 |
| `legacy/engine/rules.ts (241-264)` | 24 | 규칙 demand-count(hard) 시수 부족·초과 | F2 편성 규칙 기여 `demand-count`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (265-327)` | 63 | 규칙 block-contiguous(hard) 연속 수업 묶음 | F2 편성 규칙 기여 `block-contiguous`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (328-370)` | 43 | 규칙 cycle-order(hard) 진도 맞춤 | F2 편성 규칙 기여 `cycle-order`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (371-426)` | 56 | 규칙 agent-lunch-free(hard) 교사 점심 확보 | F2 편성 규칙 기여 `agent-lunch-free`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (427-491)` | 65 | 규칙 homeroom-plus-free(hard) 담임 겸 전담 자리 비움 | F2 편성 규칙 기여 `homeroom-plus-free`(hard) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (492-530)` | 39 | 규칙 avoid(soft) avoid | F2 편성 규칙 기여 `avoid`(soft) — 규칙마다 시험 하나 · 막힘 자료는 F5 쪽 결정(🙋)을 따름 |
| `legacy/engine/rules.ts (531-553)` | 23 | 규칙 consecutive-limit(soft) consecutive-limit | F2 편성 규칙 기여 `consecutive-limit`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (554-574)` | 21 | 규칙 prefer-consecutive(soft) prefer-consecutive | F2 편성 규칙 기여 `prefer-consecutive`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (575-606)` | 32 | 규칙 compact-day(soft) compact-day | F2 편성 규칙 기여 `compact-day`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (607-630)` | 24 | 규칙 subjects-per-day-agent(soft) subjects-per-day-agent | F2 편성 규칙 기여 `subjects-per-day-agent`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (631-658)` | 28 | 규칙 subjects-per-day-track(soft) subjects-per-day-track | F2 편성 규칙 기여 `subjects-per-day-track`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (659-686)` | 28 | 규칙 am-pm-balance(soft) am-pm-balance | F2 편성 규칙 기여 `am-pm-balance`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (687-713)` | 27 | 규칙 same-period-across-days(soft) same-period-across-days | F2 편성 규칙 기여 `same-period-across-days`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (714-744)` | 31 | 규칙 subject-adjacent(soft) subject-adjacent | F2 편성 규칙 기여 `subject-adjacent`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (745-775)` | 31 | 규칙 day-cluster(soft) day-cluster | F2 편성 규칙 기여 `day-cluster`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (776-798)` | 23 | 규칙 one-place-per-day(soft) one-place-per-day | F2 편성 규칙 기여 `one-place-per-day`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (799-830)` | 32 | 규칙 lunch-adjacent(soft) lunch-adjacent | F2 편성 규칙 기여 `lunch-adjacent`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (831-856)` | 26 | 규칙 day-load-balance(soft) day-load-balance | F2 편성 규칙 기여 `day-load-balance`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (857-891)` | 35 | 규칙 priority-early(soft) priority-early | F2 편성 규칙 기여 `priority-early`(soft) — 규칙마다 시험 하나 |
| `legacy/engine/rules.ts (892-913)` | 22 | RULES 등록표 · defaultRules · DAY_NAMES | F2 편성 규칙 기여 등록(안 쓰는 규칙은 목록에 없음) |
| `legacy/engine/solver.ts` | 708 | solveSync(자동 편성 본체 · 후보 여럿) | F1 `timetable-solver` |
| `legacy/engine/spec.ts` | 44 | makeSpec(학년별 교시 수·점심 위치 → 규격) | F1 `timetable-solver`(설계 3-2 대로) · 시간 틀 정본은 `bell` 이라 F5 뒤 쓰는 곳 없으면 버릴 후보 |
| `legacy/engine/worker.ts` | 23 | 솔버 Worker 껍데기 | F1 `timetable-solver`(Worker 입구 · F6 화면이 부름) |
| `legacy/index.css` | 123 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/io/excel.ts` | 411 | 엑셀 입출력(시수표 시트 · 반 시트 담임 이름 · 교사 시트 · 왕복) | F3 시수표 엑셀 붙이기(시수표 시트) · 반·교사 시트는 정본 편집/F10 으로 갈라야 함 — F3 에서 확정 |
| `legacy/io/sample.ts` | 277 | 샘플 학교(지어낸 이름 초등학교 Doc) | F10 왕복 시험 입력 샘플 (F13 시나리오 재료도 겸함) |
| `legacy/main.tsx` | 14 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/MANIFEST.json` | 81 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/PATCHES` | 2 | 레거시 앱 뿌리·자산(손대지 않는 사본) | FL 레거시와 함께 유지 |
| `legacy/platform/index.ts` | 60 | 웹 platform 구현(파일 열기·저장·내려받기·localStorage 자동 보관) | F10 v1-file 파일 입출력(openDoc·saveDoc) 재료 · 나머지(autosave·recent)는 버림 |
| `legacy/platform/types.ts` | 30 | Platform 인터페이스(9메서드) | F10 v1-file 재료(경계 약속 모양) · 안쪽은 `Doc` 을 안 씀 |
| `legacy/store/doc-ops.ts (1-26)` | 26 | 머리 · colorFor(과목 색 돌려쓰기) | 버림: 과목 색은 정본 `subjects` 가 가짐 |
| `legacy/store/doc-ops.ts (27-59)` | 33 | addAgent·addActivity·addResource | 버림: 정본 `staff`·`subjects`·`rooms` 가 직접 편집 |
| `legacy/store/doc-ops.ts (60-92)` | 33 | addSpec·addTrack | 버림: 정본 `bell`·`school` 이 직접 편집 |
| `legacy/store/doc-ops.ts (93-127)` | 35 | addDemand·addDemandsBulk·duplicateDemand | F3 시수표 조각 행 추가·복제 |
| `legacy/store/doc-ops.ts (128-178)` | 51 | blockStateAt·setBlockState·cycleBlock(막힘 칸 돌리기) | 🙋 WeeklyBlock 결정을 따름 — 권: (나) 편성 막힘 자료(F5) 편집 함수 |
| `legacy/store/doc-ops.ts (179-218)` | 40 | setCell·clearCell·addFixed·togglePin·toggleTemp | F8 손으로 옮기기(배치 변경 · 고정·임시 잠금) |
| `legacy/store/doc-ops.ts (219-239)` | 21 | mergeImport(엑셀·파일 불러온 결과 합치기) | F10 v1-file 쪼개 넣기 재료 |
| `legacy/store/doc-ops.ts (240-281)` | 42 | syncTracks·syncAgents·syncActivities·syncResources(이름 맞춰 합침) | F10 v1-file 쪼개 넣기 재료(정본마다 이름 대조) — 틈①의 담임 이름 대조와 같은 방식 |
| `legacy/store/doc-ops.ts (282-295)` | 14 | applyDemandSheet(시수표 시트 적용) | F3 시수표 엑셀 붙이기 |
| `legacy/store/doc-ops.ts (296-327)` | 32 | makeTracksByGrade(학년별 반 만들기) | 버림: 정본 `school` 학년도별 반이 맡음 |
| `legacy/store/doc-ops.ts (328-349)` | 22 | saveBoard·autoSnapshot·restoreBoard | F7 편성안(저장·자동 스냅샷·복원) |
| `legacy/store/ids.ts` | 11 | id 만들기 | 버림: 후라이팬 노드 id 규약이 맡음 |
| `legacy/store/store.tsx` | 393 | 화면 상태·undo 이력(200)·autosave·알림·screen/focus·Doc 변경 액션 묶음·엔진 호출 포장(runEngine) | 버림: 후라이팬 노드 저장·undo·알림·탐색이 맡음 (Doc 보관소 자체가 틀림) · 재사용 조각: runEngine 포장 → F6, diag·demand useMemo → F9·F3 |
| `legacy/types/derived.ts` | 63 | 유도 뷰 타입(Indexes·ResolvedAssignment·GridView) | 버림: 사용처 0(아무도 import 안 함 · 실측) — 엔진 EngineContext 와 중복 |
| `legacy/types/doc.ts (1-35)` | 35 | Doc 13칸 · emptyDoc | F10 v1-file (`Doc` 은 경계 조각 안에서만 · 13칸을 정본마다 쪼개 넣는 쪽 기준표) |
| `legacy/types/doc.ts (36-141)` | 106 | migrateDoc · migrateV2toV3(담임→반 속성 · 슬롯→시각) | F10 v1-file 불러오기 첫 단계(옛 파일 올림) · 담임 쪽은 틈① |
| `legacy/types/schema.ts (1-118)` | 118 | 머리 설명 · Entity · 담임 센티널 · Agent·Track·Resource·Activity | 정본 `staff`·`school`·`subjects`·`rooms` 로 읽기(저장 꼴 버림) · 엔진이 쓰는 입력 꼴만 F5 편성 입력 타입으로 옮김 |
| `legacy/types/schema.ts (119-137)` | 19 | TargetRef(대상 지정 agent/track/resource) | F5 편성 입력 타입(막힘·규칙 대상) — 정본 id 로 가리키게 바꿈 |
| `legacy/types/schema.ts (138-161)` | 24 | Blackout(날짜 구간 차단 · 시각 from/to · only/all-except) | 정본 `duty` 로 읽기(F5) · 틈 ②③ · duty 에 시각·「그 사람만/그 대상만 빼고」 없음 → 틈 절 참고 |
| `legacy/types/schema.ts (162-175)` | 14 | WeeklyBlock(요일 반복 금지·soft·temp · 대상 여럿) | 🙋 (가) `ops-days` 에 고정 일정 칸 신설 (나) 「편성 막힘」을 편성 쪽 새 자료로(F2 규칙 조각 소유) · 권: (나) — `ops-days` 는 날짜 일정·변경 두 목록뿐이라 요일 반복·soft·temp 를 못 담고, 편성 전용 제약이다 |
| `legacy/types/schema.ts (176-216)` | 41 | 시간 격자 Slot·TimetableSpec(학년별 교시 시각) | 정본 `bell` 로 읽기(F5 buildContext 입력) — 저장 꼴 버림 |
| `legacy/types/schema.ts (217-227)` | 11 | Timetable(규격을 기간에 적용 · priority) | 정본 `timetable-grid` 범위(RangeSpec 기간)로 읽기(F5) — 저장 꼴 버림 |
| `legacy/types/schema.ts (228-267)` | 40 | Assignment 배치(demandId·seq·blockId·coAgentId·pinned·temp) | 🙋 (가) 배치를 `timetable-grid` 글자 칸에 눌러 담음 (나) F7 「편성안」이 구조화 배치를 정본으로 들고 격자는 고른 안을 글자로 그림 · 권: (나) — 격자 칸은 글자+병합뿐(`timetable-grid/types.ts` Cell)이라 demandId·seq·pinned 를 못 담는다 |
| `legacy/types/schema.ts (268-299)` | 32 | Demand 시수 목표 | F3 시수표 조각 노드 꼴 |
| `legacy/types/schema.ts (300-371)` | 72 | RuleTemplate·RuleParam·ConflictRule·Violation | F2 편성 규칙 약속·기여 꼴 |
| `legacy/types/schema.ts (372-391)` | 20 | Board 시안 박제 | F7 편성안 노드 꼴 |
| `legacy/types/schema.ts (392-401)` | 10 | SchoolMeta(학교 이름·학기·schemaVersion) | 정본 `school` 로 읽기(버림) · schemaVersion 은 F10 파일 머리에서만 |
| `legacy/ui/feedback/capture.ts` | 76 | 의견 창구 | 버림: 후라이팬 의견 창구가 맡음(설계 3-3) |
| `legacy/ui/feedback/config.ts` | 21 | 의견 창구 | 버림: 후라이팬 의견 창구가 맡음(설계 3-3) |
| `legacy/ui/feedback/Feedback.tsx` | 235 | 의견 창구 | 버림: 후라이팬 의견 창구가 맡음(설계 3-3) |
| `legacy/ui/help/content.ts` | 184 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/captions.ts` | 107 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/Demo.tsx` | 102 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/draw1.tsx` | 165 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/draw2.tsx` | 192 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/draw3.tsx` | 170 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/palette.ts` | 41 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/demos/parts.tsx` | 101 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/figures/Figure.tsx` | 47 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/figures/figures1.tsx` | 277 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/figures/figures2.tsx` | 268 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/figures/helpers.tsx` | 163 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/figures/theme.ts` | 30 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/HelpContext.tsx` | 58 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/HelpDrawer.tsx` | 273 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/Markdown.tsx` | 115 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/Popover.tsx` | 127 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/rich.ts` | 98 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/richContent.ts` | 236 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/Term.tsx` | 48 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/terms.ts` | 319 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/theme.ts` | 38 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/Tour.tsx` | 175 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/tourSteps.ts` | 67 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/help/Welcome.tsx` | 237 | 도움말·둘러보기·환영·그림 해설·낱말 사전 | 버림: 후라이팬 `about` 과 사용 설명서가 맡음(설계 3-3) |
| `legacy/ui/lib.ts` | 124 | 화면 공용 헬퍼(DAY_LABEL·MOD·cellKey·cellAt·cellText·교시 세기) | F8 손으로 옮기기(칸 조회·표시) · 교시 세기는 F5 (bell 읽기) · MOD·DAY_LABEL 은 버림 |
| `legacy/ui/parts/Icon.tsx` | 54 | 아이콘 | 버림: `pane-ui-system` 아이콘이 맡음 |
| `legacy/ui/parts/Sheet.tsx` | 858 | 엑셀식 격자 편집기(858줄 자체 표) | 버림: 정본 `sheet` 표 부품 재사용(설계 3-3 「표 부품 `sheet`」) |
| `legacy/ui/parts/ui.tsx` | 259 | 화면 공용 조각(버튼·모달·입력…) | 버림: `pane-ui-system` 부품이 맡음 |
| `legacy/ui/screens.ts` | 16 | 7단계 화면 등록부 | 버림: 후라이팬 기여(views·commands)가 맡음 |
| `legacy/ui/screens/basic/DemandStatusPanel.tsx` | 54 | 시수 배정 현황 패널 | F3 시수표 옆 현황(엔진 demandStatus 호출) |
| `legacy/ui/screens/basic/DemandTable.tsx (1-198)` | 198 | 시수표 표 틀 + 열 교사 | F3 시수표 표(기본 넷 열: 교사·과목·반(학년)·주당시수) — 표 부품은 정본 `sheet` 재사용 |
| `legacy/ui/screens/basic/DemandTable.tsx (199-200)` | 2 | 열 함께수업(협력수업) | F4 선택 열 기여 「공동 담당」 |
| `legacy/ui/screens/basic/DemandTable.tsx (201-229)` | 29 | 열 과목·학년·반·주당시수 | F3 시수표 기본 열 |
| `legacy/ui/screens/basic/DemandTable.tsx (230-231)` | 2 | 열 특별실·특별실사용시수 | F4 선택 열 기여 「특별실」 |
| `legacy/ui/screens/basic/DemandTable.tsx (232-232)` | 1 | 열 연속수업(2,2 꼴) | F4 선택 열 기여 「묶음」 |
| `legacy/ui/screens/basic/DemandTable.tsx (233-233)` | 1 | 열 차시순서맞춤(순배) | F4 선택 열 기여 「묶음」 옆 칸(설계에 없는 열 — 어긋남 참고) |
| `legacy/ui/screens/basic/DemandTable.tsx (234-268)` | 35 | 표 꼬리(정렬·undo 연결) | F3 시수표 표 |
| `legacy/ui/screens/basic/ExcelBar.tsx` | 67 | 엑셀 불러오기·시수표 내려받기 막대 | F3 시수표 엑셀 붙이기 |
| `legacy/ui/screens/BasicScreen.tsx` | 514 | 기초 화면(시간 틀·반·교사·과목·특별실·시수표 한 판 + 엑셀) | F3 시수표 화면(시수표·엑셀 부분만) · 시간 틀·반·교사·과목·특별실 입력 구역은 정본 `bell`·`school`·`staff`·`subjects`·`rooms` 화면으로 버림 |
| `legacy/ui/screens/BlocksScreen.tsx` | 221 | 블록 화면(배정 불가·피함·임시·고정 칸 정하기) | 🙋 WeeklyBlock 결정을 따름 — 권: (나) 편성 막힘 자료 화면(F5) + 격자에 「편성 막힘」 겹쳐 보이기(F8) · 연가·출장 부분은 정본 `duty` 화면 |
| `legacy/ui/screens/BoardsScreen.tsx` | 115 | 안 비교 화면 | F7 편성안 화면 |
| `legacy/ui/screens/DiagnoseScreen.tsx` | 195 | 점검 화면(규칙별 위반 집계·자동 개선) | F9 점검 조각 |
| `legacy/ui/screens/EditScreen.tsx` | 382 | 편집 화면(칸 눌러 손으로 옮기기) | F8 손으로 옮기기 컴포넌트(`timetable-grid` 에 얹음) |
| `legacy/ui/screens/ExportScreen.tsx` | 163 | 내보내기 화면(인쇄·엑셀·작업 파일) | F11 인쇄·내보내기(인쇄·엑셀) · 작업 파일(.shiftgrid.json) 부분은 F10 |
| `legacy/ui/screens/GenerateScreen.tsx` | 145 | 생성 화면(돌리기·진행·멈춤) | F6 자동 편성 화면 |
| `legacy/ui/screens/HomeScreen.tsx` | 127 | 홈(「N단계」 안내·화면 고르기) | 버림: 후라이팬 탐색기·시작 화면이 맡음(설계 3-3) |
| `legacy/ui/Shell.tsx` | 292 | 앱 쉘(7단계 탭·저장·undo·밝기·도움말 단추) | 버림: 후라이팬 워크스페이스·단축키·밝기가 맡음 |
| `manifest.ts` | 21 | 레거시 플러그인 겉옷(iframe 입구·신분증) | FL 레거시 `v1-editor` 로 유지(이름·about 만 바꿈) → F12 구조 검사 대상 |
| `replace.test.tsx` | 59 | 파일로 바꾸기 시험 | F10 v1-file 시험 |
| `replace.tsx` | 85 | 「파일로 바꾸기」 순서(고르기→검사→확인→지금 것 자동 받기→바꾸기) | F10 v1-file 불러오기 흐름(설계 3-4 「이 파일로 바꿀까요」+자동 내려받기와 같은 순서) |
| `versions.test.tsx` | 78 | 판·기간 시험 | 🙋 versions.tsx 와 같이 (권: 버림) |
| `versions.tsx` | 139 | 판 보관 칸 `doc@<n>` · 적용 기간(VersionStore·VersionedGrid·VersionsPanel) | 🙋 (가) F7 「편성안」이 판·기간을 맡음 (나) 버림 — 정본 `timetable-grid` 의 범위(RangeSpec 기간)가 기간을 이미 가짐 · 보관 칸은 서버 몫. 권: (나) — 판 보관은 설계 3절에 조각이 없고 시간표 기간은 정본에 있다 |

(`legacy/assets/hero.png` 의 52줄은 바이너리라 `wc -l` 값일 뿐이다. `react.svg` 는 0줄(한 줄짜리).)

## 2. 틈 셋 확정 (설계 3-1)

설계는 「순수 담임이 문자열 · 요일 0~4 · 시각 문자열」 셋을 말한다. 셋 다 실측으로 확인했고, **정본 쪽 모양이 설계가 짐작한 것과 조금 다르다**. 셋 밖에서 발견한 틈은 3절에 따로 적었다.

### 틈 ① 순수 담임 = 사람이 아니라 반의 문자열

- **v1 `Doc` 에만 있는 것**: 담임이 `Track.homeroomName?: string`(`legacy/types/schema.ts:97-102`). 담임 수업은 사람 없이 `agentId='__homeroom__'` 센티널(`schema.ts:66-68`)이 `Demand`·`Assignment` 에 박힌다. `migrateDoc` 이 담임 `Agent` 를 지우고 이름을 반에 적는다(`types/doc.ts:73-103`). 엑셀·화면도 문자열로 다룸(`io/excel.ts:263,322` · `BasicScreen.tsx:282-315`).
- **1.2v 정본**: 사람 → 반 관계. `staff` 의 `f_homeroom`(담임 반, relation — `staff/config.ts:44-46`)과 구분 선택지 `homeroom`(`:19`). 정본에 **없는 것** = 「이 반의 담임은 누구」 역방향 칸, 그리고 「담임 수업 = 센티널」 개념.
- **권하는 처리**: 변환은 경계(F10)에서만. 불러오기 = `homeroomName` 을 `staff` 이름과 맞춰 `f_homeroom` 으로 잇고, 이름이 `staff` 에 없으면 「담임 구분 행을 새로 만들까요」를 확인창 목록에 올린다(만들면 왕복 시험이 「처음 파일과 같다」를 지킨다). 내보내기 = `f_homeroom` 역으로 `homeroomName` 채움. 엔진 안쪽(F1·F5)은 센티널을 **그대로 둔다**(설계 2절 8번 「알고리즘은 바꾸지 않고 꼴만」) — F5 `buildContext` 가 「그 반의 담임 수업 줄」을 센티널로 만들어 엔진에 준다. 동명이인·담임 없는 반은 F10 시험 입력에 넣는다.

### 틈 ② 요일 번호

- **v1**: `dayIndex` 0=월 … 4=금(`schema.ts:165` WeeklyBlock · `:235` Assignment · `engine` 전체). 월~금 다섯 날만.
- **1.2v 정본**: `timetable-grid` 는 `GridDay` **1=월 … 6=토**(`timetable-grid/types.ts:16-17`). `duty`·`ops-days` 는 요일이 아니라 **날짜**(`YYYY-MM-DD`)로 적는다. 한편 레포 공용 `shared/clock.ts`(`DAY_NAMES` 월~금 :18 · `seoulDay().dayIndex` 0=월 :83-86)와 `shared/sub-engine` 은 v1 과 같은 0 시작이다.
- **정본에 없는 것**: 0 시작 요일, 그리고 날짜→요일 변환 약속(`duty`·`ops-days` 날짜를 `dayIndex` 로 바꾸는 한 곳).
- **권하는 처리**: 엔진 안쪽은 0 시작 유지(`shared` 가 같다). `contract-solver` 에 `toGridDay(dayIndex)=dayIndex+1` · `fromGridDay` 한 쌍과 날짜→`dayIndex`(`seoulDay` 재사용)를 두고 경계(F5 입력 조립·F8 격자 얹기·F10)만 부른다. 토요일(6)은 엔진 입력에서 거르고 「토요일 칸은 편성에 안 쓰입니다」를 보인다.

### 틈 ③ 시각 표기

- **v1**: 시각이 `"HH:mm"` 문자열(`schema.ts:40 · 143 · 167 · 188-189`) — 슬롯 시작·끝, Blackout·WeeklyBlock 의 from/to.
- **1.2v 정본**: `bell` 은 **같은 문자열** `'HH:MM'`(`bell/config.ts:25-26`, 검증 `bell/clock.ts:24-37`) — 대소문자만 다르고 모양은 같다. 다른 쪽은 `timetable-grid` 가 **분 정수**(`types.ts:8-13` `Minute`·`TimeRange`). `duty` 는 시각이 아예 없고 **교시 문자열**(`duty/config.ts:31-32` 「3-4, 5」)+종일 체크.
- **정본에 없는 것**: `duty` 의 시각 구간(v1 Blackout 은 from/to). v1 은 `schema.ts:157-159` 주석대로 교사·특별실 금지는 **교시가 아니라 시각**으로 적어야 한다(학년마다 같은 교시 번호의 시각이 달라서 사고가 났다 — 선생님 의견 #12).
- **권하는 처리**: `bell` ↔ v1 은 변환 불필요(문자열 그대로). `timetable-grid` 만 `shared/clock.ts` `toMin`/`toHHMM`(:21,:28)으로 변환. `duty` 교시는 F5 가 `bell` 의 「표시 틀(교시 수가 가장 많은 학년)」 기준 시각 구간으로 바꿔 읽고(`migrateV2toV3` 가 이미 같은 규칙 — `doc.ts:77,126-128`), 화면에 「교시를 학년 ○의 시각으로 읽었습니다」 한 줄을 남긴다. 학년마다 달리 막아야 한다는 요구가 나오면 `duty` 에 시각 칸을 신설(그때 가서 🙋).

## 3. 셋 밖에서 발견한 틈 (설계 3-1 이 「된다」고 적은 것이 정본에 없다)

| 틈 | 실측 | 영향 판 | 권하는 처리 |
|---|---|---|---|
| ④ **`weeklyBlocks → ops-days 고정 일정` 은 갈 데가 없다** | `ops-days/types.ts` 는 `calendar`(날짜 일정·휴업)·`changes`(그날 교시 변경)·`classSubjects` 셋뿐. 요일 반복·soft·temp·대상 여럿(반·교사·특별실) 없음 | F2·F5 | 🙋 (가) `ops-days` 확장 (나) 「편성 막힘」을 편성 쪽 자료로 — **권 (나)**: 편성 전용 제약이고 정본 `ops-days` 는 날짜 사실이라 모양이 안 맞는다 |
| ⑤ **`assignments → timetable-grid` 는 구조가 안 담긴다** | `timetable-grid/types.ts` 의 칸은 `text`+병합+시간뿐. v1 배치는 `demandId·seq·blockId·coAgentId·pinned·temp`(`schema.ts:228-267`) | F7·F8 | 🙋 (가) 격자 글자에 눌러 담기 (나) 「편성안」이 구조화 배치를 정본으로 들고 격자는 고른 안을 글자로 그림 — **권 (나)** |
| ⑥ `blackouts → duty` 는 사람 대상만 | `duty` 는 `f_person` 한 칸. v1 Blackout 은 대상이 반·특별실도 되고 `all-except`(`schema.ts:138-150`) | F5 | 사람 차단은 `duty` 에서 읽고, 반·특별실 차단·`all-except` 는 ④ 의 편성 막힘 자료로(같은 🙋) |
| ⑦ `timetables` 우선순위 | v1 `Timetable.priority`(특별표 우선·`schema.ts:217-225`) · `timetable-grid` `RangeSpec` 은 기간만(`types.ts:20-23`) | F5·F7 | 엔진이 `solver.ts:72-78` 에서 규격→시간표 id 만 씀 — 우선순위는 F5 에서 `bell` 줄로 풀거나 쓰는 곳이 없으면 버림(F5 착수 때 재측정) |

## 4. F 판별 크기

「줄」은 위 표에서 그 F 로 간 행의 줄 합(파일이 여러 F 로 갈리면 구간만 센다). 새로 짓는 코드는 v1 줄 수에 안 잡힌다.

| 판 | 파일 수 | 줄 합 | 8분 판 판정 |
|---|---:|---:|---|
| F1 | 12 | 1,810 | **쪼갤 것** — 옮김 1,810줄은 기계적이나 (가) 모듈 이동+`contract-solver` 약속 (나) 시험 연결(NAS 정답 1,820)은 따로 8분을 넘긴다 |
| F2 | 2 | 985 | **쪼갤 것** — 규칙 23개(하드 9·소프트 14) + 규칙 틀. 틀+하드 / 소프트 두 판 |
| F3 | 7 | 1,389 | **쪼갤 것** — (가) 노드·표 화면·기본 넷 열 (나) 엑셀 붙이기(`excel.ts` 411줄+`ExcelBar`) 두 판 |
| F4 | 1 | 6 | 안 쪼갬 — 옮길 코드 6줄, 열 다섯을 새로 짓는 판 |
| F5 | 3 | 499 | 안 쪼갬 — 단 🙋(편성 막힘 자료)가 정해지기 전엔 착수 못 함 |
| F6 | 1 | 145 | 안 쪼갬 — 145줄 + Worker 연결 |
| F7 | 5 | 414 | 안 쪼갬 — 단 🙋(배치 정본·판 기간)가 앞에 정해져야 함 |
| F8 | 3 | 546 | 안 쪼갬(경계) — 546줄 이동+`timetable-grid` 에 얹는 새 컴포넌트. 얹기가 막히면 둘로 |
| F9 | 1 | 195 | 안 쪼갬 — 195줄 |
| F10 | 10 | 851 | **쪼갤 것** — 불러오기(쪼개 넣기+틈 변환 셋) / 내보내기(모으기)+왕복 시험 |
| F11 | 1 | 163 | 안 쪼갬 — 163줄 |
| F12 | 1 | 89 | 안 쪼갬 — 스크립트 정지+구조 검사 둘 |
| FL | 17 | 923 | 안 쪼갬 — 이름·about·기본 꺼짐 |
| 버림 | 42 | 6,465 | (가져가는 판 없음) |

- 판정 기준(F0 가 정함): 옮기는 줄이 1,500 을 넘거나, 새로 짓는 조각이 둘 이상이거나, 시험 연결이 따로 필요하면 쪼갠다. 기계적 이동은 줄이 많아도 한 판으로 본다.
- 🙋 가 걸린 줄(F5 막힘 286줄 · F7 배치·판 기간 257줄)은 해당 F 의 줄 합에 들어 있다. 🙋 의 권하는 쪽이 받아들여지면 F7 에서 `versions.tsx`+시험 217줄이 빠진다.
- 합이 설계 4절의 「순서 FL ∥ F0 → (F1 ∥ F3) → …」와 겹치는 파일: `DemandTable.tsx` 를 F3 와 F4 가 구간으로 나눠 갖는다(같은 파일 → 두 판이 충돌하지 않게 F3 가 먼저 뜯고 F4 가 열 기여로 뽑는다).

## 5. 설계와 어긋남

| # | 설계 노트 | 실측 |
|---|---|---|
| 1 | 1절 「v1 도움말·둘러보기·의견 창구 **45개 파일**」 | `legacy/ui` **전체**가 45파일(7,824줄). 도움말·둘러보기·의견 창구(`help/`+`feedback/`)는 **28파일 3,970줄**이다. 3-3 머리의 「`legacy/ui` 45파일」은 맞음 |
| 2 | 3-3 「버림: `help/`·`feedback/` **대부분**」 | 28파일 **전부** 버림(가져갈 만한 조각 없음). 낱말 사전 `terms.ts`(319줄)만 각 조각 `about` 쓸 때 문구 재료 |
| 3 | 1절 「편성기 하나가 나머지 **열여섯 개**를 합친 것보다 크다」 | `src/plugins/` 는 편성기 빼고 **22개**, 줄 합 28,446(시험 뺀 ts/tsx). 편성기 13,220 은 그보다 작다. 도메인 쪽 14개(staff·school·subjects·rooms·bell·duty·ops-* 등)만 세면 합 5,651 이라 「더 크다」가 참. 「270~360줄」은 `staff` 357·`school` 322·`subjects` 271·`bell` 289 로 맞음 |
| 4 | 3-1 `weeklyBlocks → ops-days 고정 일정` | `ops-days` 에 고정 일정 칸이 없다(3절 ④) |
| 5 | 3-1 `timetables·assignments → timetable-grid` | 격자 칸이 글자라 구조화 배치를 못 담는다(3절 ⑤) |
| 6 | 3-1 `blackouts → duty` | 사람 대상만 맞고 시각·반·특별실·`all-except` 없음(3절 ⑥) |
| 7 | 3-1 틈 셋의 「요일 0~4」 | 1.2v 에서 요일이 문제인 곳은 `timetable-grid` 한 곳(1~6). `shared` 쪽은 v1 과 같은 0 시작이라 틈이 아님(2절 ②) |
| 8 | 3-1 틈 셋의 「시각이 문자열」 | `bell` 도 같은 문자열이라 틈이 아님. 진짜 틈은 `timetable-grid`(분 정수)와 `duty`(교시 문자열)(2절 ③) |
| 9 | F4 「공동 담당·특별실·묶음·**격주·고정**」, 재검수 「시수표 열 14개」 | `DemandTable.tsx` 열은 **10개**(교사·함께수업·과목·학년·반·주당시수·특별실·특별실사용시수·연속수업·차시순서맞춤). **격주는 `v1-editor` 전체에서 0건**. 「고정」은 열이 아니라 배치 잠금(`schema.ts:246` `pinned` · `doc-ops.ts:204` `addFixed`)이라 F8 몫. 설계에 없는 열 **차시순서맞춤(순배)**·특별실사용시수가 있다. 선택 열은 다섯(함께수업·특별실·특별실사용시수·연속수업·차시순서맞춤) |
| 10 | 3-2 엔진 목록(`core·solver·worker·spec·context·capacity·resource-pool·evaluate·move` + `rules`) | 12파일은 맞음. 목록에 없는 둘: `api.ts`(223줄 — 약속 서명 · `contract-solver` 의 실체)와 `__fixtures__/small.ts`. 시험 `legacy-engine-resource-pool.test.ts` 는 `legacy/` 밖(`v1-editor/` 루트)에 있다 |
| 11 | 3-2 「`rules.ts` 의 규칙 틀 → 낱개 기여」 | 규칙 **23개**(하드 9·소프트 14), 913줄. F2 `규칙마다 시험 하나` = 시험 23개 |
| 12 | 설계 3절에 없는 파일 | `versions.tsx`(판 보관 `doc@<n>`·적용 기간 139줄)와 시험, `bundle-platform.ts`(94줄) — 3-4·5절이 platform 표만 언급. `versions` 는 🙋 |
| 13 | 3-3 「편성기 안 읽기 격자(둘)」 | 읽기 격자 `grid/` 4파일 298줄 + `versions.tsx` 안 `VersionedGrid` 한 벌(`timetable-grid` 와 합쳐 셋). 모두 버림 |
| 14 | — (언급 없음) | `legacy/types/derived.ts`(63줄)는 **사용처 0**(아무도 import 안 함) |
| 15 | 3-1 「`meta`→`school`」 | `school` 정본은 학교 이름·학교급·학년도별 반만 있고 `term`(학기)·`schemaVersion` 칸은 없다(`school/config.ts:21-23`). `schemaVersion` 은 F10 파일 머리에서만 쓰면 되고 `term` 은 쓰는 곳이 없으면 버림(F5 때 확인) |

어긋남 합계: **15건**.
