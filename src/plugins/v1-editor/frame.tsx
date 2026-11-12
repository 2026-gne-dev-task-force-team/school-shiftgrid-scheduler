// v1 편성 판 — 같은 출처 iframe 한 장. 판 안 컴포넌트(P10 뒤 절반)가 이 틀을 쓴다.
export const V1_EDITOR_SRC = './v1-editor.html'

export function V1EditorFrame() {
  return <iframe src={V1_EDITOR_SRC} title="시간표 편성" style={{ width: '100%', height: '100%', border: 0 }} />
}
