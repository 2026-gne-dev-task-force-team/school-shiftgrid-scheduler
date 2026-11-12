// 담백 검사 — 선생님 눈에 가는 글에 비밀 값·경로·이메일 꼴이 있으면 거절한다.
const SHAPES: RegExp[] = [
  /sk[-_][A-Za-z0-9]/, // 열쇠 꼴
  /ey[J][A-Za-z0-9_-]{6,}/, // 토큰 꼴
  /[A-Za-z]:[\\/]/, // 윈도우 경로
  /(^|[\s"'(])\/(Users|home|etc|var|mnt)\//, // 유닉스 경로
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // 이메일
]
export const isPlain = (text: string): boolean => !SHAPES.some((r) => r.test(text))
