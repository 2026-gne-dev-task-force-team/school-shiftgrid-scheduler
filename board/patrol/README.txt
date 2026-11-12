감독관 순찰 (patrol.mjs) — 원천은 읽기만. --write <노트.md> 를 주면 결과를 그 노트로 통째 덮어쓴다(임시 파일 → rename).
직전 노트와 본문(frontmatter · 「순찰 시각」 뺀 것)이 같으면 안 쓴다 — 씽크를 흔들지 않는다.
sg-merge 에 머지된 뒤에 설치한다(plist 는 sg-merge 의 patrol.mjs 를 가리킨다). 경로가 절대경로라 sed 없이 복사한다.

설치(맥 터미널 한 줄):
  cp "$HOME/Desktop/gne-dev-task/sg-merge/board/patrol/mac/board-patrol.plist" "$HOME/Library/LaunchAgents/kr.gne.board-patrol.plist" && launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/kr.gne.board-patrol.plist"

끄기:
  launchctl bootout "gui/$(id -u)/kr.gne.board-patrol" && rm "$HOME/Library/LaunchAgents/kr.gne.board-patrol.plist"

로그: tail "$HOME/Library/Logs/board-patrol.log"
