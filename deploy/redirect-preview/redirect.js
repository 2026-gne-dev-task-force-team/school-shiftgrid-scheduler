// /preview/ → /v1.2/ 주소 계산. 같은 하위 경로·쿼리·해시를 새 주소로 옮긴다.
// 사이트가 /<저장소>/ 아래에 있어도 맞게 — 「…/preview/」 마디만 「…/v1.2/」 로 바꾼다.
function previewTarget(pathname, search, hash) {
  var m = /^(.*?)\/preview(\/.*)?$/.exec(pathname)
  var base = m ? m[1] : pathname.replace(/\/[^/]*$/, '')
  var rest = m && m[2] ? m[2] : '/'
  // index.html 로 직접 들어온 경우는 폴더 주소로
  rest = rest.replace(/index\.html$/, '')
  return base + '/v1.2' + rest + (search || '') + (hash || '')
}
if (typeof module !== 'undefined') module.exports = { previewTarget: previewTarget }
