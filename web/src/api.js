// 서버와 말하는 한 곳. CSRF 토큰은 메모리에만 둔다.
let csrf = '';

export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': body instanceof Blob ? 'application/octet-stream' : 'application/json', 'X-CSRF-Token': csrf },
    body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined, // 파일(Blob)은 그대로
  });
  const json = await res.json().catch(() => ({}));
  if (json.csrf) csrf = json.csrf;
  // 서버의 오류 본문을 버리지 않는다: message 는 사람이 읽을 문장, body 는 통째(재확인 사유 목록 등)
  if (!res.ok) throw Object.assign(new Error(json.error || json.message || '처리하지 못했습니다'), { status: res.status, body: json });
  return json;
}

// 오늘 적용 중인 확정본의 내 칸 — 적용 시작일이 미래인 확정본은 서버가 걸러 준다
export const appliedMinePath = (P) => `${P}/timetables/applied/mine`;
