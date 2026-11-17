> v1-editor 는 2026-11-17 F12 에서 걷음 — 이 문서는 걷기 전 기록이라 본문의 v1-editor 경로·표는 고치지 않았다.

# R128 플러그인 설계 바로잡기 ① — 중복 쌍 실측 표 (T-10eh · U22)

> 기준: 레포 `school-shiftgrid-scheduler` 가지 `1.2v-preview` 7d6bca0 · 경로는 모두 `src/plugins/` 아래(따로 적은 것 제외) · 줄 수는 `wc -l` 실측(시험 뺀 `.ts`·`.tsx`, `*-E` 백업 제외) · 이번 판은 **표만**, 코드 변경 0.
> 용어: 「약속」 = 플러그인이 내놓는 공용 입구(`provides`·`contracts/`). 「위 보기」 = 정본 플러그인의 자료를 `contributes`(화면·명령 기여)로만 다시 보여 주는 얇은 껍데기. 「정본」 = 자료와 규칙을 쥐는 쪽.

## 0. 먼저 읽을 것 (결론 5줄)

1. 쌍 다섯 중 **진짜 같은 일을 하는 쌍은 둘**(`staff`↔`substitute` · `ops-room`↔`room-booking`)뿐이다. `ops-sub`↔`substitute`·`ops-days`↔`calendar`는 **같은 일이 아니라 층이 다르다**(업무 ↔ 명단 · 학사 규칙 ↔ 일정 그릇). 요청 틀(「쌍마다 정본 하나, 다른 쪽은 위 보기」)이 이 둘엔 그대로 안 맞아 표에 이유를 적었다.
2. `ops-*` 다섯은 `manifest` 에 `requires`·`provides`·`nodeTypes` 가 **하나도 없다**(`ops-room/index.ts:14-21` · `ops-sub/index.ts:16-32` · `ops-days/index.ts:13-17` · `ops-aux/index.ts:17-23` · `ops-check/index.ts:12-22`). 다른 플러그인이 이들을 약속으로 읽는 수 = **0**. 이들을 가리키는 것은 id 문자열뿐(`layout/mobile.ts:9` 의 `ops-sub`, 활성 목록 `site.config.json:15`·`src/app/plugins.ts:36-40`·`src/app/activation.golden.test.ts:50`).
3. 그 반대편(`staff`·`rooms`·`calendar`)은 틀을 다 쓴다: 셋 다 `provides` + `requires: nodes` + `contributes.interfaces` + `contributes.nodeTypes` + `contracts/`. 그래서 **남길 정본은 `staff`·`rooms`+`room-booking`·`calendar`** 로 고르는 게 기준(틀을 더 잘 씀)에 맞다.
4. 그런데 정본 쪽엔 **`ops-*` 의 규칙이 들어갈 구멍이 아직 없다**: 달력 프리셋에 저장 전 검증 훅이 없고(`calendar/contracts/calendar.ts:113-125`), `rooms`·`staff` 약속엔 칸이 이름·메모 둘뿐이다(`rooms/contracts/rooms.ts:41`·`staff/contracts/staff.ts:34` 의 `ext` 는 「타입에만 비워 둔 자리」). → **위 보기로 바꾸기 전에 정본 약속에 구멍부터 뚫어야** 「사라지는 기능 0」이 된다(4절 판 1~3).
5. `ops-*` 의 모양은 서버 칸(`PART_NAMES = doc·rooms·calendar·changes·fixed·classSubjects·aux·settings`, `shared/bundle/types.ts:3`)과 서버 함수(`supabase/functions/{rooms,sub,parts}`)를 흉내 낸 것이다. 저장소만 노드로 바꾸면 이 서버 모양과 어긋날 수 있다 → 🙋.

## 1. R128 다섯 칸 표 (쌍마다 한 줄 이상)

근거 약칭: `P=provides` `R=requires` `S=supports` `I=contributes.interfaces` `N=contributes.nodeTypes` `C=contracts/`.

| 쌍 | 남길 정본(근거) | 위 보기로 갈 쪽 | 그쪽에만 있는 기능 → 옮길 자리 | 옮길 저장 자료(키·꼴) |
|---|---|---|---|---|
| **A1 방 예약** `ops-room`↔`room-booking`(+`rooms`) | **`room-booking`** + `rooms` + `calendar`. 근거: `room-booking/manifest.ts:14` `requires calendar ^0.2·rooms ^0.1·nodes ^0.1`, `:15` `supports collection` / `ops-room` 은 R·P·I·N·C 전부 0. 줄 수는 ops-room 1,053 > room-booking 89 이지만 room-booking 은 달력 **프리셋 한 장**(`index.ts:15-34`)이라 얇은 게 설계다. 약속으로 읽는 수: `room-booking`←0(꼬리), `rooms`←1(`room-booking/index.ts:12` 타입 문자열), `calendar`←1(`room-booking/index.ts:56,58,61`) · `ops-room`←0 | `ops-room` 의 화면 둘(`특별실 예약`·`특별실 관리`, `index.ts:16-17`) → `room-booking` 위 보기로 | 2절 A1 표 **정원·자리번호·고정 사용·차단·규칙·역할·CSV·고정 사용 불러오기** 8묶음 → 방 속성은 `rooms` 의 방 칸(🙋 갈림길 ①), 고정·차단은 `calendar` 반복·종일 일정(`calendar/series.ts:194`), 규칙은 `calendar` 프리셋에 **저장 검증 훅 신설**(판 1), 역할은 `account` 의 `permit`(`account/contracts/permit.ts:12-17`) | `plugin.ops-room.part` = `{part:{rooms[],fixed[],blocks[],timetable[]}, rows[]}` → 방은 `rooms.room`(이름·메모 + 정원·자리·켜짐·정렬·`resourceKey`), 고정·차단·예약행은 `calendar.event`(`f_room` 관계 칸 + 구분 칸). 변환은 3절 |
| **A2 방 목록 껍데기** `rooms` | `rooms` 그대로(P·R·S·I·N·C 전부 있음: `rooms/index.ts:23-27,30,44`) | — (이미 정본) | `ops-room` 의 방 칸 `capacity`(1~20)·`resourceKey`·`active`·`sort`(`shared/room-rules.ts:14`) 를 받을 칸이 없음 → 판 2 | `rooms.room` 노드 `data`(이름·메모·`parentId`) + 확장 |
| **B1 보결 명단** `staff`↔`substitute` | **`staff`**. 근거: `staff/index.ts:23` P `staff 0.1.0` · `:26` R · `:30` I · `:44` N · C 있음(`staff/contracts/staff.ts`) / `substitute/index.ts:17-18` R 만(P·I·C 0). 약속으로 읽는 수: `staff`←2(`timetable-grid/views/WelcomeCard.tsx:23` `modules.use<Staff>` · `demand-table/resolve.ts:6,56` 타입 읽기; `supports` 선언 `timetable-grid/index.ts:31`·`demand-table/index.ts:19`) · `substitute`←0 약속(문자열 1: `layout/mobile.ts:7`) | **`substitute`** → `staff` 위 보기. `staff/config.ts:6` 가 이미 「구분 value 는 보결 명단과 똑같다 — 나중에 보결 명단을 이 명단으로 갈아 낄 때 값 이사가 없게」라고 적어 둠(설계가 예정한 방향) | `substitute` 에만 있는 것은 **없음**: 칸 이름·메모·구분(`substitute/config.ts:12-18,34-35`) 은 `staff` 가 전부 가짐(`staff/config.ts:14-23,51,65`). 다만 `staff` **약속**(`contracts/staff.ts:22-34`)엔 `구분` 이 안 노출됨 → 판 3 에서 약속에 `kind` 읽기 추가 | 노드 `substitute.list`/`substitute.staff`(`substitute/config.ts:10-11`) → `staff.list`/`staff.member`(`staff/config.ts:10-11`). 칸 `f_kind`(select: `homeroom·subject·nonteaching·assistant`)가 양쪽 **같은 키·같은 value**. 이사 = 노드 타입 이름 바꾸기만 |
| **B2 보결 업무** `ops-sub`↔`substitute` | **`ops-sub` 업무 로직은 정본 없음(남긴다)**. 이유: `ops-sub` 는 보결 **줄**(`sub_slot`: 날짜·반·시각·상태·맡은 이)과 맡기·취소·지정 규칙이고 `substitute` 는 **사람 명단**이라 같은 일이 아니다. 서버도 별개(`supabase/functions/sub`·`parts`). 틀 쓰기: `ops-sub` P·R·N·C 0 | `ops-sub` 의 **저장·명단 읽기**만 약속으로 갈아 낀다(위 보기가 아니라 「약속 쓰는 쪽」으로) | `ops-sub` 가 가진 사람 개념은 문자열 `absentRef`(`homeroom:<반>` 또는 agent id)·`takerRef`(`ops-sub/list/types.ts:8,20`) → `staff` 의 `member(id)`(`staff/contracts/staff.ts:53+`) 로 푼다. 화면 다섯(목록·내 것·등록·상세·관리, `index.ts:17-23`)은 그대로 | `plugin.ops-sub.part` = `SubSlotRow[]`(`ops-sub/list/source.ts:55,61-72`) → 보결 줄은 `calendar.event` 의 프리셋(`f_status`·`f_absent`·`f_taker` 관계 칸)이 후보이나 **서버 `sub_slot` 과의 대응이 걸려 🙋 ②** |
| **C 일정** `ops-days`↔`calendar` | **`calendar`**. 근거: `calendar/index.ts:60` R `nodes` · `:62` S · `:64` P `calendar 0.2.0` · `:69` I · `:110` N · C `calendar/contracts/calendar.ts` · 시험 295개 · 5,233줄 / `ops-days` P·R·N·C 0 · 619줄. 약속으로 읽는 수: `calendar`←1(`room-booking`) + 내부 구독 · `ops-days`←0 | `ops-days` 의 학사 일정 부분(`calendar` 목록) → `calendar` 프리셋 「학사」 위 보기. **시간표 변경·담임 과목은 달력 일정이 아님**(아래) | 2절 C 표: 학사 일정 → 달력 종일 일정(`ops-days/types.ts:7` `kind all/event` ↔ 달력 `allDay`). 시간표 변경(`changes`: 반·교시·과목) → 달력 일정 한 칸으로 가능하나 교시→시각이 `bell`(`provides clock`)에 기댐 → 🙋 ③. 담임 과목 불러오기(`import/classImport.ts` 258줄) → 달력과 무관, `school`·`subjects` 쪽 또는 `ops-days` 에 남김 | `plugin.ops-days.part` = `{calendar:[{id,date,endDate,kind,title}], changes:[{id,date,classKey,period,subject,note,createdBy}], classSubjects?:[{trackName,dayIndex,start,subject}]}` → 학사 일정 → `calendar.event`(allDay, 구분 칸), 시간표 변경 → `calendar.event`(allDay + 반·교시·과목 칸) |
| **D1 사람 명단 — 교직원** `people`·`staff` | **`staff`** (같은 일 · P·R·S·I·N·C 동일 구조, 읽는 쪽 있음). `staff` 357줄 · 읽는 약속 소비자 2 / `people` 297줄 · 약속 소비자 0(`shared/sub-engine` 의 `people` 는 변수 이름) | **`people`** → `staff` 위 보기(🙋 ④: 학교 낱말 없는 범용 명단이라 `ExplorerView.tsx:56` 시작 목록에 들어 있음) | `people` 에만: **학교를 모르는 이름**(「반·동아리·부서 같은 사람 목록」, `people/manifest.ts:17-19`). `staff` 는 담임·전담 구분이 기본 칸이라 일반 명단에서 어색함 → 지우지 않고 「구분」 칸을 빼고 쓰면 됨(사용자 칸이라 지울 수 있음: `staff/config.ts:16` 은 `locked:true` ← **못 지움**, 🙋 ④) | `people.list`/`people.person` → `staff.list`/`staff.member`. 칸 이름·메모 같음. 이사 = 타입 이름 바꾸기 |
| **D2 사람 명단 — 보조인력** `ops-aux`(명부 부분) | **`staff`** (보조인력은 구분 `assistant` 가 이미 있음: `staff/config.ts:22`) | `ops-aux` 의 **명부 화면**(`AuxPanel.tsx:51-68`)을 `staff` 위 보기로 | `ops-aux` 만 가진 칸: `kind`(기초학력·한국어·디지털튜터·자원봉사·기타 5값)·`unit`(clock/period)·`active`·`allowedActivities[]`·`targetTracks[]`(`ops-aux/types.ts:8`) → `staff` 사용자 칸 새로(`kind` 는 기존 `f_kind` 4값과 **다름** → 새 칸 `f_auxKind`) | `AuxPart.staff[]`(`ops-aux/types.ts:8`) → `staff.member` + 사용자 칸. 같은 사람이 `staff` 명단에 이미 있으면 `f_person` 관계 칸(`staff/config.ts:48`)으로 잇는다 |
| **D3 근태 나머지** `ops-aux`(배정·정산) | **`calendar`**(날짜별 배정·예외) · 마감·조건은 **정본 후보 없음**(🙋 ⑤) | — | `conditions`(요일별 근무)·`base`(요일 반복 배정)·`day`(날짜별 배정)·`exceptions`(결근·지각…)·`monthClose`(월 마감) 6칸 중 `staff` 외 5칸. `base`→달력 **반복 일정**(`calendar/recur/`), `day`·`exceptions`→달력 일정, `conditions`·`monthClose`→ 맞는 정본 **없음** | `AuxPart` 6 배열(`ops-aux/types.ts:20`) |
| **E 데이터 검사** `ops-check`↔(편성기 F9 점검) | **U20 F9 점검 조각과 하나로**(v1-editor `DiagnoseScreen` 195줄: `docs/1.2v-editor-split/F0-inventory.md:155,216`). 정본 자리는 아직 없음(F9 는 이번 가지에 코드 없음 — 못 잼: F9 판 미착수) | `ops-check` 화면(`CheckPanel.tsx` 70줄) | 검사 대상이 다름: `ops-check` = **파일**(v1 문서·덩어리)을 `shared/check` 17규칙으로 검사(`run.ts:10-17`), F9 = **편성 결과**의 규칙 위반 집계. 하나로 하되 입력이 둘 → 🙋 ⑥ | **저장 자료 없음**: `ops-check` 는 `localStorage` 를 쓰지 않는다(`grep localStorage ops-check` 0건). 요청문의 「다섯 저장」 중 `ops-check` 는 해당 없음 |

표의 빈칸 = 0. 「못 잼」은 E 정본 칸 1곳(이유 있음).

## 2. 기능 목록 대조 (사라지는 기능 0 확인)

표기: `OK`=정본 쪽에 이미 있음 · `❌`=**정본 쪽에 없음(사라질 위험)** · `△`=정본에 비슷한 것은 있으나 같지 않음. 화면·명령·설정 단위로 센다. 근거 파일은 각 줄 끝.

### A1 방 예약 — `ops-room`(+`room-booking`+`rooms`)

| 기능 | 어디서 | 정본(`room-booking`+`rooms`+`calendar`) 쪽 |
|---|---|---|
| 날짜·시각 고르고 **빈 방 찾기**(자리 남은 방만 sort 순) | `ops-room/RoomPanel.tsx:22,45-52` · `book/book.ts:145-148` | ❌ 달력 주 보기는 방별 빈자리 계산 없음 |
| 반 이름으로 예약 · **방+날짜+시작+반 중복 막기** | `book/source.ts:42` · `RoomPanel.tsx:43` | ❌ 달력 일정은 중복 검사 없음 |
| **정원(자리) 번호 자동 부여**·정원 초과 막기(1~20) | `book/source.ts:35-40` · `manage/ops.ts:33-38` | ❌ `rooms` 방 칸은 이름·메모뿐(`rooms/contracts/rooms.ts:11-19`) |
| **지난 날 예약 막기** · 쉬는 날 판정 | `shared/room-rules.ts:124`(`decideReserve`) | ❌ |
| 내 예약 모아 보기 + **취소**(본인·교감·교무) | `RoomPanel.tsx:34,57` · `book/visibility.ts:170,173` | △ 달력에 내 일정 필터는 없고 취소 권한은 노드 삭제 권한뿐 |
| **공개 범위**(같은 프로젝트만 · 계정 id·메모는 관리자·본인만) | `book/visibility.ts:160-167` | ❌ |
| **고정 사용**(방·요일·시각 반복 점유) 보기·추가·삭제 | `manage/ops.ts:13-14`(`addFixed`·`delFixed`) · `shared/room-rules.ts:16` | △ 달력 반복 일정(`calendar/series.ts:194`)으로 표현 가능, 요일·시작 겹침 검사(`fixedDuplicates` `shared/room-rules.ts:172`)는 ❌ |
| **차단**(날짜 범위·시각 범위·사유) | `RoomManage.tsx:107-118` · `manage/ops.ts:11-12` | △ 달력 종일 일정으로 표현 가능, 끝<시작 검사는 ❌ |
| 방 추가·고침·**끄기**·지우기(관리 역할만) | `RoomManage.tsx:86-104` | △ `rooms` 에 방 추가·고침·지우기(휴지통) 있음(`rooms/contracts/rooms.ts:60+`), **끄기(`active`)** 는 ❌ |
| 방 **정원·`resourceKey`(시간표 특별실 연결)·정렬 순서** | `shared/room-rules.ts:14` | ❌ |
| 방 목록 **CSV 내보내기/불러오기**(미리보기→확정) | `manage/csv.ts:1-89` · `RoomManage.tsx:122-124` | △ `rooms` 는 엑셀·한글 표 붙여넣기(`pasteRooms`, `rooms/contracts/rooms.ts:89`)만, CSV 내보내기 ❌ |
| **고정 사용 파일 불러오기**(hwp·hwpx·xlsx·csv → 방 칸 미리보기 → 반영) | `import/roomImport.ts` 290줄 · `RoomImportView.tsx` 103줄 | ❌ |
| 시간표 배치(`timetable`)를 **읽기 전용 고정**으로 잠그기 | `book/book.ts:140` | ❌ |
| 덮어쓰기 충돌(`etag`) | `book/source.ts:38,55` | △ 노드 시스템에 낙관적 잠금이 있는지 **못 잼**(`pane-ui-system/core/nodes` 미조사) |
| 달력 주 보기 · 방 관계 칸 · 팔레트 「새 방 예약」 · 리본 | `room-booking/index.ts:19-21,43-48` | OK (이쪽에만 있음 — 정본이 더 가짐) |
| 명령·리본: `ops-room.open-book`·`open-manage`(리본 9·10) | `ops-room/index.ts:19-20` | △ `room-booking.open`(리본 5)로 합침. 관리 입구는 ❌ |

→ A1 ❌ **8** · △ **7** · OK 1(합 16줄). △ 7 개도 「그대로 되는지」 판에서 시험해야 한다.

### B1 보결 명단 — `substitute`→`staff`

| 기능 | 어디서 | `staff` 쪽 |
|---|---|---|
| 명단 만들기·사람 추가·고침·지움·옮기기 | `substitute/config.ts:94-111` | OK `staff/config.ts:54-71` |
| 구분 칸(담임·전담·비교과·보조인력) 선택지 고치기·더하기 | `substitute/config.ts:12-18` | OK `staff/config.ts:16-23` |
| 표 붙여넣기로 여러 명 한 번에 | `substitute/manifest.ts:17` | OK(둘 다 컬렉션 바닥 `defineCollection`) |
| 모바일 첫 화면 연결(`SUBSTITUTE_PLUGIN`) | `layout/mobile.ts:7-21` · `mobile.test.ts` | ❌ `staff` 가 아니라 `substitute` id 를 가리킴 → 위 보기 id 를 남기거나 mobile.ts 갱신 |
| 보결 명단 리본·명령 `substitute.open`(리본 5) | `substitute/index.ts:27-28` | OK `staff.open`·`staff.openList`·리본 4(`staff/index.ts:39-42`) |
| 사람 명단 칸 `f_person` 없음 → 등급·학년·과목·담임 반 칸 | — | OK(`staff` 가 더 가짐) |

→ B1 ❌ **1**(모바일 id) · △ 0.

### B2 보결 업무 — `ops-sub`(정본 없음, 약속 갈아 끼움)

| 기능 | 어디서 | 비고 |
|---|---|---|
| 보결 목록(날짜·시각별) | `ListPanels.tsx` · `list/list.ts` | 그대로 둠 |
| 내 보결(내가 맡은·빠진) | `ListPanels.tsx` `MinePanel` | 그대로. 모바일 첫 판(`layout/mobile.ts:9`) |
| 보결 등록(입력 검사·덮어쓰기 되묻기) | `register/register.ts:52,81,92` | 그대로 |
| 상세·맡기·맡기 취소(같은 시각 중복·지난 날 막기) | `detail/detail.ts:28,42` | 그대로 |
| 관리(삭제·확정 되돌리기·지정·강제 지정, 확인 단계) | `admin/admin.ts:31,69` | 그대로 |
| 공개 범위(올린 이·누른 이 감사 칸) | `list/visibility.ts` | 그대로 |

→ 위 보기로 가지 않는다 → **사라지는 기능 0**. 갈아 끼울 곳: ① 저장(`localSlotSource`) ② 사람 이름·id(`absentRef`·`takerRef` 문자열 → `staff` 약속).

### C 일정 — `ops-days`→`calendar`

| 기능 | 어디서 | `calendar` 쪽 |
|---|---|---|
| 학사 일정 보기(휴업일 `all`·행사 `event`, 날짜 범위) | `DaysPanel.tsx:61` · `types.ts:7` | OK 종일 일정 · 구분은 사용자 칸 필요(프리셋 `baseFields`, `calendar/contracts/calendar.ts:121`) |
| 학사 일정 넣기·고치기 **(교무·교감·근태담당만)** | `ops.ts:12-16` · `shared/roles.ts:34` | ❌ 역할 제한 없음 → `permit` 연결 필요 |
| 시간표 변경 보기(반·교시·과목·메모) | `DaysPanel.tsx:63-77` · `types.ts:8` | △ 일정 한 건으로 표현 가능, 칸 신설 |
| 시간표 변경 넣기 **(교사는 자기 이름으로만)**·지우기 **(자기 것만)**·지우기 확인 | `ops.ts:25-45` | ❌ |
| 월 고르기(`YYYY-MM`) 필터 | `DaysPanel.tsx:59` | OK 월 보기 |
| **담임 과목 불러오기**(hwp·hwpx·xlsx·csv → 반별 요일·시각 과목, 전담 칸 대조) | `import/classImport.ts` 258줄 · `ClassImportView.tsx` 70줄 | ❌ 달력과 무관 |
| 담임 과목 **반영 권한**(교무·교감·관리자) | `ops.ts:22-23` | ❌ |
| 칸 규칙(날짜 꼴·끝≥시작·제목 비지 않음·교시 1~10) | `ops.ts:51-65` | ❌ 달력엔 교시 개념 없음 |
| 충돌 재생(`replay`)·낙관적 조작 큐 | `ops.ts:67-70` | 못 잼(달력은 노드 저장이라 다른 모델) |
| ICS 가져오기/내보내기·구독·반복·표로 보기·년/월/주/3일/하루 | `calendar/index.ts:88-100` | OK (달력만 가짐 — 정본이 더 가짐) |

→ C ❌ **5**(역할 둘·교사 자기 것·담임 과목 불러오기·칸 규칙) · △ 1.

### D2/D3 근태 — `ops-aux`

| 기능 | 어디서 | 갈 자리 |
|---|---|---|
| 명부(이름·종류·단위·활동·대상 반) 보기·추가 | `AuxPanel.tsx:51-68` | `staff` 사용자 칸(D2) — 칸 신설 필요 |
| **쉬게 하기/되돌리기**(`active`)·확인 | `AuxPanel.tsx:55-63` | `staff` ❌ 켜짐/꺼짐 없음(사용자 칸으로) |
| 날짜별 배정 보기·넣기·지우기(`base`+`day` 합친 `effectiveOn`) | `ops.ts:83-100` | `calendar` △ |
| **재배정 필요 판정**(수업·허용 교과·근무 시간과 어긋남, 14일) | `ops.ts:100-126` · `lessons.ts` | ❌ 정본 없음(수업 칸은 번들 `shared/bundle` 에서 읽음) |
| 상태바 배지 `14일 안 재배정 필요` | `index.ts:21,26` · `AuxStatus.tsx` | ❌ |
| 월 정산·예외(결근·지각·조퇴·추가·정정) 합계 | `month/total.ts:13` · `MonthPanel.tsx` | ❌ |
| **월 마감·해제 잠금**(마감 뒤 정정만 허용) | `shared/ops-aux/month-lock.ts:19` | ❌ (서버와 함께 쓰는 순수 함수 — 서버 쪽 이전 필요) |
| 권한: 근태담당만 | `ops.ts:32` · `shared/roles.ts:40` | ❌ |

→ D2/D3 ❌ **6** · △ 1.

### E `ops-check`

| 기능 | 어디서 | F9 쪽 |
|---|---|---|
| 파일 하나 고르기(`.json`)·형식 판별(v1/번들/깨짐/빈 파일) | `CheckPanel.tsx:46-49` · `run.ts:10-16` | ❌ F9 는 편성 결과 점검 |
| 규칙 17개 결과·걸린 규칙 id·`자세히` 접기 | `plain.ts:13-27` · `CheckPanel.tsx:20` | ❌ |
| 「이 번들로 쓰기」(번들이면 채택) | `CheckPanel.tsx:63-66` | ❌ |

→ E ❌ **3**(합치면 입력 둘을 다 받는 화면이어야 함).

### 합계 (사라질 위험 = `❌`)

| 묶음 | ❌ | △ |
|---|---:|---:|
| A1 방 예약 | 8 | 7 |
| B1 보결 명단 | 1 | 0 |
| B2 보결 업무 | 0 | 0 |
| C 일정 | 5 | 1 |
| D2/D3 근태 | 6 | 1 |
| E 검사 | 3 | 0 |
| **합** | **23** | **9** |

## 3. `ops-*` 저장 실측

> 「창구(`*Source`)」 = 화면이 자료를 읽고 쓰는 단 한 곳. 다섯 다 같은 모양: `memory…Source` 위에 `local…Source` 가 `localStorage` 를 얹고, 기본 창구가 `local…` 이다. 바깥에서 창구를 서버용으로 갈아 끼우는 호출(`setRoomSource` 등)은 시험 밖 **0건**(`grep` 실측) → 지금 이 플러그인들의 실제 저장은 전부 기기 `localStorage` 다.

| 플러그인 | 키 | 자료 꼴(줄 수) | 옮길 정본 | 옛 자료 한 번 옮기기 변환 |
|---|---|---|---|---|
| `ops-room` | `plugin.ops-room.part` (`book/source.ts:74,80,91`) | `{part:{rooms:Room[],fixed:RoomFixed[],blocks:RoomBlock[],timetable:RoomFixed[]}, rows:ReservationRow[]}` · 창구 105줄 · 전체 1,053줄 | `rooms`(방) + `calendar`(고정·차단·예약행) | `rooms[]`→`rooms.addRoom(listId,{name,memo})`(`note`→`memo`) + 방 속성(정원·`resourceKey`·`active`·`sort`)을 ext/칸으로 · `fixed[]`→반복 일정(`dayIndex`·`startMin`·`endMin`·`label` → 요일 반복 RRULE + 시작/끝 시각) · `blocks[]`→종일/시각 범위 일정(`startDate`…`reason`) · `rows[]`→`calendar.event`(`roomId`→`f_room` 관계, `trackName`→제목, `body.userId·userName·note`→메모/작성자 칸, `slotNo` 는 규칙이 재계산하므로 버림 또는 칸) · `timetable[]` 은 **읽기 전용 복사본**이라 옮기지 않고 시간표에서 다시 읽음 |
| `ops-sub` | `plugin.ops-sub.part` (`list/source.ts:55,61-72`) | `SubSlotRow[]`(날짜·반·시각·`status` 대기/확정·`body`·`take`) · 창구 96줄 · 전체 842줄 | 🙋 ②: 후보 `calendar`(프리셋) | 줄 하나 → 일정 하나(`date`·`startMin`·`endMin`→시작/끝, `trackName`→반 칸, `status`·`body.absentRef`→관계 칸(`staff.member` id 로 풀기), `take.takerRef`→관계 칸). `absentRef` 가 `homeroom:<반>` 꼴이면 사람 id 가 아니므로 문자열 칸으로 남김 |
| `ops-days` | `plugin.ops-days.part` (`source.ts:20,26-39`) | `{calendar:CalendarEvent[], changes:TimetableChange[], classSubjects?:ClassSubject[]}` · 창구 59줄 · 전체 619줄 | `calendar` | `calendar[]`→종일 일정(`date`~`endDate`, `title`, `kind`→구분 칸) · `changes[]`→종일 일정(`classKey`·`period`·`subject`·`note`·`createdBy` → 칸 넷 + 작성자) · `classSubjects[]` 는 달력에 안 맞음 → `ops-days` 에 남기거나 `school` 쪽 🙋 ③ |
| `ops-aux` | `plugin.ops-aux.part` (`source.ts:34,44,55`) | `{staff[],conditions[],base[],day[],exceptions[],monthClose[]}` 6 배열 · 창구 93줄 · 전체 603줄 | `staff`(명부) + `calendar`(`base`·`day`·`exceptions`) · `conditions`·`monthClose` 는 **맞는 정본 없음** 🙋 ⑤ | `staff[]`→`staff.addMember`(이름) + 사용자 칸(`kind`·`unit`·`active`·`allowedActivities`·`targetTracks`) · `base[]`(`staffId:dow:startMin`)→주 반복 일정 · `day[]`→일정(`source` reassign/manual/none → 구분) · `exceptions[]`→일정(`amount`·`kind`·`note`) |
| `ops-check` | **없음**(`grep localStorage src/plugins/ops-check` 0건) | 저장 자료 없음 · 파일은 읽기만(`manifest.ts:15`) | — | 변환 없음. 다만 「이 번들로 쓰기」(`CheckPanel.tsx:63-66`)가 번들 저장소(`src/app/bundle.ts:21` → `adoptBundle`)에 넣음 — 이건 `localStorage` 직접 저장이 아니라 번들 길이다 |

참고: `ops-aux` 는 `shared/bundle/store.ts` 의 `getBundle` 도 읽는다(`ops-aux/source.ts:3`, 수업 칸). `ops-aux` 의 `localStorage` 이전과 별개로 이 읽기도 정본(시간표)을 약속으로 읽는 쪽으로 바꿔야 할지는 🙋 ⑤.

못 잼:
- 쥔님·선생님 기기에 이미 쌓인 `plugin.ops-*.part` 자료의 양·모양: **못 잼**(사용 기기 접근 없음). 옮기기 판은 「키가 비어 있으면 건너뜀」으로 짜면 되고 자료가 있으면 이전, 없으면 아무 일도 안 한다.
- 서버 칸(`rooms`·`calendar`·`changes`·`fixed`·`aux`)과 노드 일정의 1:1 대응: **못 잼**(`supabase/functions/parts` 의 칸 규칙을 이 판에서 읽지 않음).

## 4. 판 쪼개기 제안 (8분 판)

판 크기 기준 = F0 와 같게(`F0-inventory.md:228`): 옮기는 줄 ≤ ~1,500, 새로 짓는 조각 ≤ 1, 시험 연결이 따로 필요하면 쪼갬. 실제로는 **약속 구멍 뚫기 → 값 이사 → 화면 위 보기 → localStorage 걷기** 순.

| 판 | 하는 일 | 건드리는 파일(줄 수) | 편성기 분해 판과 겹침 |
|---|---|---|---|
| **R1** | `calendar` 프리셋에 **저장 전 검증 훅** + `permit` 연결(`beforeSave(event, ctx)`). 약속 버전 0.2→0.3 | `calendar/contracts/calendar.ts`(127)·`calendar/presets.ts`·`calendar/nodes.ts`(317) | 없음. 단 **방 예약·학사·보결 판 전부의 앞 판** |
| **R2** | `rooms` 약속에 방 속성(정원·`resourceKey`·`active`·`sort`) 읽기·쓰기(ext 쓰는 코드 신설, 🙋 ①) | `rooms/contracts/rooms.ts`(93)·`rooms/api.ts`(35)·`rooms/config.ts`(31) | 없음 |
| **R3** | `staff` 약속에 `kind`·등급·보조 칸 읽기 추가 | `staff/contracts/staff.ts`(76)·`staff/api.ts`(32)·`staff/config.ts`(71) | 없음(`timetable-grid`·`demand-table` 이 `staff` 를 읽으므로 **약속 하위 호환 시험** 필수) |
| **R4** | `substitute` → `staff` 값 이사(타입 이름 바꾸기 변환) + `substitute` 를 위 보기로 | `substitute/*`(156)·`layout/mobile.ts`(`:7-21`)·`mobile.test.ts` | `site.config.json:14`·`src/app/plugins.ts`·`activation.golden.test.ts:50` 는 **플러그인 목록을 만지는 모든 판이 공유** — 편성기 FL 판(이름·about·기본 꺼짐, 17파일)과 **같은 3파일** |
| **R5** | `people` 처리(🙋 ④ 결과대로: 남김/위 보기) | `people/*`(297)·`ExplorerView.tsx:56` | 위 3파일 공유 |
| **R6** | `room-booking` 에 정원·고정·차단 칸 + 규칙(`shared/room-rules.ts` 재사용, 서버 `rooms` 함수와 같은 규칙 파일이라 **건드리지 않음**) | `room-booking/index.ts`(66)·`shared/room-rules.ts`(읽기만) | 없음 |
| **R7** | `ops-room` 예약·빈 방 찾기·내 예약 화면을 `room-booking` 위 보기로 | `ops-room/RoomPanel.tsx`(64)·`ops-room/book/*`(약 250) | 위 3파일 공유 |
| **R8** | `ops-room` 관리·CSV·고정 사용 불러오기를 정본 쪽으로 이전 | `ops-room/manage/*`(약 285)·`import/*`(약 400) | `shared/import` 를 읽는 쪽 — 편성기 F10(불러오기, 851줄)과 `shared/import` 공유 → 두 판이 같은 파일을 안 고치게 순서 맞출 것 |
| **R9** | `ops-room` `localStorage` 한 번 옮기고 걷기 + 이전 시험 | `ops-room/book/source.ts`(105) · `localSource.test.ts` | 없음 |
| **R10** | `ops-days` 학사 일정·시간표 변경 → `calendar` 프리셋 「학사」 | `ops-days/DaysPanel.tsx`(90)·`ops.ts`(70)·`types.ts`(11) | **`ops-days/types.ts` — F0 ④가 「편성 막힘(고정 일정 칸) 을 `ops-days` 에 넣을지」🙋 로 걸어 둔 파일(`F0-inventory.md:102,197`)**. F0 ④ 가 (나)로 정해진 뒤에 착수(권: (나) 면 R10 과 안 겹침) |
| **R11** | 담임 과목 불러오기 자리 정하기(🙋 ③) | `ops-days/import/*`(약 460) | `shared/import` — F10 과 공유 |
| **R12** | `ops-days` `localStorage` 이전·걷기 | `ops-days/source.ts`(59)·`import/daysFrame.ts` | 위 R10 뒤 |
| **R13** | `ops-sub` 저장·사람 읽기를 약속으로 갈아 끼움(🙋 ② 결과) | `ops-sub/list/source.ts`(96)·`register/register.ts`·`detail/detail.ts`·`admin/admin.ts` | `shared/sub-engine`(`canon-input.ts`)을 읽는 쪽 — F7(배치) 과 `shared/` 경계 확인 |
| **R14** | `ops-sub` `localStorage` 이전·걷기 | `ops-sub/list/source.ts`·`list/source.test.ts` | 없음 |
| **R15** | `ops-aux` 명부 → `staff`(R3 뒤) | `ops-aux/AuxPanel.tsx`(104)·`types.ts`(20) | 없음 |
| **R16** | `ops-aux` 배정·예외 → `calendar`, 월 마감·조건은 🙋 ⑤ 정해진 대로 | `ops-aux/ops.ts`(152)·`month/*`(약 100)·`shared/ops-aux/month-lock.ts`(서버와 공유) | `ops-aux/lessons.ts` 가 번들을 읽음 — 편성기 F7(배치)과 번들 꼴 변경 시 충돌 |
| **R17** | `ops-aux` `localStorage` 이전·걷기 | `ops-aux/source.ts`(93)·`localSource.test.ts`·`bundle-persist-chain.test.ts` | `src/app/bundle-persist-chain.test.ts:28` 가 `ops-aux/source.ts` 를 직접 import → 편성기 쪽 번들 판과 같은 시험 파일 |
| **R18** | **`ops-check` ↔ U20 F9 점검 하나로** — 입력 둘(파일·편성 결과) 받는 화면 | `ops-check/*`(163) + `v1-editor` F9 195줄(미이관) | **F9 와 직접 겹침**. F9 가 먼저 이관된 뒤에 합친다(F9 앞에 합치면 옮길 코드가 두 번 바뀜). 반대로 F9 가 R18 을 기다리면 안 됨 |

순서: `R1`∥`R2`∥`R3` → `R4`·`R6` → `R7`·`R5` → `R8`·`R9` → `R10`(F0 ④ 결정 뒤)·`R13`·`R15` → `R11`·`R12`·`R14`·`R16`·`R17` → `R18`(F9 뒤). 판 수 **18**.

플러그인 목록 3파일(`site.config.json:14-15` · `src/app/plugins.ts:36-40,53` · `src/app/activation.golden.test.ts:50`)은 위 보기로 바꾼 플러그인을 **지우는 판**(R7·R9 등 마무리)에서 같이 고친다. 이때 활성 골든이 깨지므로 같은 판 안에서 골든 갱신.

## 5. 🙋 갈림길 (권하는 쪽과 근거)

| # | 갈림길 | 권하는 쪽 | 근거 |
|---|---|---|---|
| ① | 방 속성(정원·`resourceKey`·켜짐·정렬)을 어디에 둘까 | `rooms` 방의 **`ext['room-booking']`** 에 두고 `rooms` 약속에 쓰는 코드(`setExt`) 신설 | `rooms/contracts/rooms.ts:38-41` 가 「위층이 플러그인 id 이름공간으로 꽂는다」로 자리를 이미 정해 둠. 반대안(사용자 칸 `newListFields`, `staff/config.ts:14` 방식)은 `rooms` 가 학교 낱말(정원)을 갖게 되어 「학교를 모르는 방」(`rooms/manifest.ts:2`) 원칙과 어긋남 |
| ② | 보결 줄(`sub_slot`)을 달력 일정으로 옮길지, 별도 저장으로 둘지 | **옮기지 않고 `ops-sub` 의 약속(`sub`)을 새로 내고 저장만 노드로** | 서버에 `sub` 함수와 `sub_slot` 이 따로 있고(`supabase/functions/sub`) 줄 하나에 상태·맡기·감사 칸이 있어 달력 일정 칸 모델과 모양이 다름. 못 잼: 서버 `sub` 의 칸 규칙을 이 판에서 안 읽음 |
| ③ | 담임 과목 불러오기(`classSubjects`)를 어디에 둘까 | `ops-days` 에 **남긴다**(위 보기에서 제외) | 학사 일정·변경과 달리 반별 요일·시각 표라 달력에 안 맞음(`ops-days/types.ts:12`). 합치면 R10 이 커짐(교시→시각 변환이 `bell` 에 기댐) |
| ④ | `people` 을 정말 위 보기로? | **남긴다** — 단 `staff` 와 같은 틀을 쓰는 「범용 명단」으로 이름·about 을 가른다 | 쥔님 요청의 4 사람 명단 중 `people` 만 **학교를 모르는** 쪽(`people/manifest.ts:2-4`)이고 `ExplorerView.tsx:56` 시작 목록에 들어 있음. `staff` 구분 칸은 `locked`(`staff/config.ts:16`)이라 일반 명단에서 못 지워 「사라지는 기능 0」이 아니라 「거추장스러운 칸 1」이 됨 |
| ⑤ | 근태 `conditions`·`monthClose`(요일별 근무 · 월 마감)의 정본 | **`ops-aux` 안에 남긴다**(저장만 노드로) | 맞는 정본(`staff`·`rooms`·`calendar`)이 없음. 마감 판정은 서버와 공유하는 순수 함수(`shared/ops-aux/month-lock.ts:19`)라 따로 옮길수록 서버와 어긋날 위험 |
| ⑥ | `ops-check` 와 F9 를 합칠 때 입력 둘(파일·편성 결과) | **한 화면 두 탭** | 검사 규칙(`shared/check` 17개)과 편성 점검(`evaluate.ts` 규칙)이 서로 다른 모듈이라 규칙을 합칠 수 없음. 화면만 하나로 |
| ⑦ | 역할(교무·교감·근태담당…)을 지금은 `ops-*` 가 데모 사람 한 명으로 흉내 냄(`ops-days/DaysPanel.tsx:11` `demoViewer`·`ops-sub/list/source.ts` `setViewer`·`ops-room/book/source.ts` `setViewer`) | `account` 의 `permit`(`account/contracts/permit.ts:12-17`)으로 잇기 | 이미 `account` 가 `provides permit 0.1.0`(`account/index.ts:50`)을 가짐. 지금 역할 검사는 `shared/roles.ts` 표를 직접 읽음 — 정본 쪽에서 쓰려면 `permit` 에 그 권한 낱말(`room.manage` 등)을 올려야 함. 어느 판에 넣을지(R1) 쥔님 확인 |

---

**빈칸 세기**: 1절 표 칸 8행 × 5열 = 40칸 중 빈칸 **0** · 「못 잼」 표기 **1**(E 행 정본 칸 — F9 미착수, 이유 적음) · 2절 표 **못 잼 2**(낙관적 잠금 `etag` 대응·충돌 재생 모델 — 이유 적음) · 3절 못 잼 **2**(기기 자료·서버 칸 대응).
