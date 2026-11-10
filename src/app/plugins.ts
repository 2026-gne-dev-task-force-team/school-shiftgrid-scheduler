/**
 * 설치된 플러그인(꾸러미) 목록 — ⭐ 여기 한 줄이 「설치」다(정적 번들).
 *
 * 🔑 「나중에 갈아끼울 데」: 동적 로드(외부 .js)로 가도 바뀌는 파일은 이 한 장이다
 *    — activateAll 은 모듈이 어디서 왔는지 모른다.
 *
 * 🧪 플러그인 하나를 뺐다 넣었다: 코어가 아닌 줄을 주석 처리하면 리본이 비고
 *    저장된 탭은 자리표시 글자(EditorArea)로 남는다 — 되돌리면 그 자리에서 돌아온다.
 *
 * 🔴 ⭐ 2026-11-08 「플러그인은 꾸러미다」(쥔님 18:55) — 약속(contract-*)을 터뜨려 두지 않고 **꾸러미 안으로 묶었다**.
 *    약속(타입)·제공 부품은 그 꾸러미 폴더 안의 부품이고 따로 토글되지 않는다. 약속은 꾸러미가
 *    매니페스트 contributes.interfaces 로 들고 온다(옛 별도 contract-* 플러그인 7개 삭제). 켜고 끄는 단위 = 꾸러미 하나.
 *    📌 미등록 약속 폴더 여섯(contract-absence·clock·export·roster·timetable·week-grid)은 2026-11-10 쥔님 지시로 전부 걷었다 — 다시 정의한다.
 */
import type { PluginModule } from '../pane-ui-system/plugin';
import { CORE_PLUGINS } from '../pane-ui-system/core';


import { calendarPlugin } from '../plugins/calendar';
import { accountPlugin } from '../plugins/account';
import { peoplePlugin } from '../plugins/people';
import { sheetPlugin } from '../plugins/sheet';
import { timetableGridPlugin } from '../plugins/timetable-grid';
import { roomsPlugin } from '../plugins/rooms';
import { roomBookingPlugin } from '../plugins/room-booking';
import { pagePlugin } from '../plugins/page';
import { collectionPlugin } from '../plugins/collection';
import { paneTestPlugin } from '../plugins/pane-test';


// 🔴 코어 넷(settings·explorer·selection·properties)은 core:true 라 activateAll 이 목록 순서와 무관하게 먼저 활성한다. ⛔ 설정·탐색기는 끌 수 없다.
//    탐색기 꾸러미가 nodes 약속을 들고 오므로(contributes.interfaces), nodes 는 코어 꾸러미에 묶여 끌 수 없는 범용 약속으로 선다.
// 📌 2026-11-01 21:47 쥔님: Pane UI Test 는 런타임 등록 해지(paneTestPlugin 을 뺐다 · 코드·폴더는 그대로).
export const PLUGINS: PluginModule[] = [
    // ── 플랫폼 층(manifest.layer 'platform') — 노드·본문·속성·설정의 바닥. 위 코어 둘은 끌 수 없다
    // 🍳 이사 중: core/ 로 간 코어는 CORE_PLUGINS 한 줄로 오고(core/index.ts 에 한 줄씩 더한다), 아직 plugins/ 에 있는 코어는 아래에 직접 선다.
    //    활성 순서(골든)가 settings → explorer → selection → properties 라 아직 이사 안 한 둘이 core 를 감싼다 — 이사 판마다 해당 줄을 지우고 core 배럴에 더한다.
    ...CORE_PLUGINS,         // core/ 폴더의 코어 — settings → explorer → selection → properties → icon-pack-basic(골든 순서)
    pagePlugin,              // 페이지 꾸러미 — 노션식 블록 페이지(문서 본문)
    collectionPlugin,        // 컬렉션 꾸러미 — collection 약속 + 컬렉션 노드 화면(속성 레지스트리)
    sheetPlugin,             // 시트 꾸러미 — 격자 엔진(table 약속) + 시트 노드
    // ── 범용 앱 층('app') — 끌 수 있다
    calendarPlugin,          // 달력 꾸러미 — calendar 약속 · 구독은 달력 안(calendar/subscribe/)
    accountPlugin,           // 계정 꾸러미 — identity·credential·permit
    // ── 학교 도메인 층('domain') — 끌 수 있다
    peoplePlugin,            // 사람 명단 꾸러미
    roomsPlugin,             // 방 목록 꾸러미
    roomBookingPlugin,       // 방 예약 꾸러미 — 달력 프리셋 한 장
    timetableGridPlugin,     // 시간표 그리드 꾸러미(시트 확장)
    // 🧪 개발 전용 — 개발 서버에서 주소 끝에 `?pane-test` 를 붙여 열면 Pane UI Test(부품 견본 포함)가 켜진다. 배포본·일반 화면엔 안 뜬다.
    ...(import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('pane-test') ? [paneTestPlugin] : []),
];
