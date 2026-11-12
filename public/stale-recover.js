/* 배포 직후 묵은 index/서비스워커가 지워진 옛 자산(main-*.js)을 부를 때의 백지 복구.
   classic 스크립트(모듈 아님) — 진입 모듈이 404 여도 이건 떠야 한다. 한 번만: sessionStorage 깃발. */
(function (root) {
  var KEY = 'sg-stale-recover'
  function recover(env) {
    try {
      if (env.storage.getItem(KEY) === '1') return Promise.resolve(false)
      env.storage.setItem(KEY, '1')
    } catch (e) { return Promise.resolve(false) }
    var jobs = []
    try {
      if (env.sw && env.sw.getRegistrations) {
        jobs.push(env.sw.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister() }))
        }))
      }
      if (env.caches && env.caches.keys) {
        jobs.push(env.caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return env.caches.delete(k) }))
        }))
      }
    } catch (e) { /* 조용히 */ }
    return Promise.all(jobs).catch(function () {}).then(function () {
      env.reload()
      return true
    })
  }
  function isEntryScript(t) {
    return !!t && t.tagName === 'SCRIPT' && t.type === 'module' && /\/assets\//.test(t.src || '')
  }
  function install(win) {
    win.addEventListener('error', function (ev) {
      if (!isEntryScript(ev.target)) return
      recover({
        storage: win.sessionStorage,
        sw: win.navigator.serviceWorker,
        caches: win.caches,
        // 쿼리를 바꿔 HTTP 캐시(max-age=600)된 index 도 건너뛴다
        reload: function () { win.location.replace(win.location.pathname + '?_r=' + Date.now()) },
      })
    }, true)
    // 앱이 정상으로 뜨면 깃발을 내려 다음 배포 때 다시 한 번 복구할 수 있게 한다
    win.addEventListener('load', function () {
      win.setTimeout(function () {
        try { if (win.document.getElementById('root').childNodes.length) win.sessionStorage.removeItem(KEY) } catch (e) { /* */ }
      }, 3000)
    })
  }
  root.__staleRecover = { recover: recover, isEntryScript: isEntryScript, KEY: KEY }
  if (typeof root.addEventListener === 'function' && root.document) install(root)
})(typeof window !== 'undefined' ? window : globalThis)
