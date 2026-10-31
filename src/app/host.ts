/**
 * 호스트 앱의 창구 — 주인 'app' 으로 만든 호스트 하나.
 *
 * 🔴 ⭐ 바깥(앱)은 뷰 등록소를 직접 읽지 않는다 — 이 host 로만 읽는다(index.ts 에서 registerView·getView 수출이 빠졌다).
 *    앱 자신이 뷰를 등록할 일이 생기면(지금은 데모 플러그인이 다 맡아 없다) 같은 host 로, 주인 'app' 으로 등록한다
 *    — 노트 「여기서 죽는다: 호스트 앱 자신의 등록은 주인 app 으로 같은 길을 쓴다」.
 */
import { makeHost } from '../pane-ui-system/plugin';

export const appHost = makeHost('app');
