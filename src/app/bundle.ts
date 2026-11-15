/**
 * 시간표 번들 로더 — 앱이 번들을 읽어 들이는 한 곳. 본체(보관·판별)는 shared/bundle/store.ts.
 * 플러그인(ops-aux·ops-days)은 이 파일이 아니라 shared 의 getBundle 로 읽는다(플러그인이 src/app 을 import 하지 않는다).
 */
export { loadBundle, setBundle, getBundle } from '../../shared/bundle/store.ts'
