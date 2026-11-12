// /preview/ 에 남은 옛 1.2v 서비스워커를 스스로 지우는 서비스워커.
// 옛 서비스워커가 있는 기기는 이 파일(같은 주소 /preview/sw.js)을 새 판으로 받아 설치 → 즉시 활성 →
// 캐시 전부 삭제 · 등록 해제 · 열린 창을 같은 주소로 다시 열어(넘겨주기 페이지가 /v1.2/ 로 보낸다) 끝난다.
self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys()
      await Promise.all(keys.map(function (k) { return caches.delete(k) }))
    } catch (e) { /* 캐시 접근 실패는 넘긴다 */ }
    try { await self.registration.unregister() } catch (e) { /* 이미 해제됨 */ }
    try {
      var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      await Promise.all(wins.map(function (c) { return c.navigate(c.url) }))
    } catch (e) { /* 창 다시 열기 실패 — 다음 열 때 넘겨주기 페이지가 뜬다 */ }
  })())
})
