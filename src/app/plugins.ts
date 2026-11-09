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
 *    ⛔ 미등록 약속 폴더 여섯(contract-absence·clock·export·roster·timetable·week-grid)은 소비자·제공자가 생길 때
 *       그 꾸러미로 들어간다 — 지금은 PLUGINS 에 없다(「필요 없는 건 안 박힌다」).
 */
import type { PluginModule } from '../pane-ui-system/plugin';
import { settingsPlugin } from '../plugins/settings';
import { explorerPlugin } from '../plugins/explorer';
import { calendarPlugin } from '../plugins/calendar';
import { accountPlugin } from '../plugins/account';
import { peoplePlugin } from '../plugins/people';
import { sheetPlugin } from '../plugins/sheet';
import { timetableGridPlugin } from '../plugins/timetable-grid';
import { roomsPlugin } from '../plugins/rooms';
import { pagePlugin } from '../plugins/page';
import { collectionPlugin } from '../plugins/collection';
import { selectionPlugin } from '../plugins/selection';
import { propertiesPlugin } from '../plugins/properties';

// 🔴 코어(settings·explorer)는 core:true 라 activateAll 이 목록 순서와 무관하게 먼저 활성한다. ⛔ 설정·탐색기는 끌 수 없다.
//    탐색기 꾸러미가 nodes 약속을 들고 오므로(contributes.interfaces), nodes 는 코어 꾸러미에 묶여 끌 수 없는 범용 약속으로 선다.
// 📌 2026-11-01 21:47 쥔님: Pane UI Test 는 런타임 등록 해지(paneTestPlugin 을 뺐다 · 코드·폴더는 그대로).
export const PLUGINS: PluginModule[] = [
    settingsPlugin,
    explorerPlugin,   // 탐색기 꾸러미 — 코어(끌 수 없다). nodes 약속을 들고 와 채운다(provides) + 탐색기 패널(N1)
    calendarPlugin,          // 달력 꾸러미 — calendar 약속을 들고 와 채운다 · nodes 를 requires
    accountPlugin,           // 계정 꾸러미 — identity·credential·permit 를 들고 와 채운다(증명은 꾸러미 안 내부 모듈) · nodes 를 requires
    peoplePlugin,            // 사람 명단 꾸러미 — people 약속을 들고 와 채운다 · nodes 를 requires
    sheetPlugin,       // 표 편집기 꾸러미 — table 약속을 들고 와 채운다(헤드리스)
    timetableGridPlugin,     // 시간표 그리드 꾸러미 — nodes 를 requires
    roomsPlugin,             // 방 목록 꾸러미 — rooms 약속을 들고 와 채운다 · nodes 를 requires
    pagePlugin,        // 페이지 편집기 꾸러미 — 노션식 블록 페이지 노드 · nodes 를 requires
    collectionPlugin,        // 레코드 뷰 꾸러미 — collection 약속을 들고 와 채운다(provides) + 레코드 뷰 노드 화면
    selectionPlugin,         // 선택 알림 꾸러미 — selection 약속을 들고 와 채운다(화면 없음) · 탐색기가 알리고 속성이 듣는다
    propertiesPlugin,        // 속성 꾸러미 — 오른쪽 「속성」 패널 · 칸은 대상 주인이 contributes.properties 로 낸다 · selection 을 supports
    // 📌 2026-11-09 쥔님 *"구독을 달력 플러그인 안으로 들여라"* — 옛 calendarSubscribePlugin 은 달력 꾸러미 안(calendar/subscribe/)으로 들여 별도 등록을 걷었다.
];
