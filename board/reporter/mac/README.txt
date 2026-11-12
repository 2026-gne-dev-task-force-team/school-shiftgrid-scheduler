맥 보고꾼 (launchd, 2분마다 publish.mjs). 경로는 ../config.mac.json 이 정한다(`~` 로 적혀 있다).
sg-merge(합쳐진 판)에 머지된 뒤에 설치한다 — 그 전엔 그 자리에 publish.mjs 가 없다.

설치(맥 터미널 한 줄):
  sed "s|__HOME__|$HOME|g" "$HOME/Desktop/gne-dev-task/sg-merge/board/reporter/mac/board-reporter.plist" > "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist" && launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist"

제거:
  launchctl bootout "gui/$(id -u)/kr.gne.board-reporter" && rm "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist"

상태/로그: launchctl print "gui/$(id -u)/kr.gne.board-reporter" | head ; tail "$HOME/Library/Logs/board-reporter.log"
