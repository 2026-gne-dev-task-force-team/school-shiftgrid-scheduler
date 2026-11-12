맥 보고꾼 (launchd, 2분마다 publish.mjs). 경로는 ../config.mac.json 이 정한다(`~` 로 적혀 있다).
T-9a 부터 git 을 쓰지 않는다 — 스냅숏을 만들어 이 맥에서 바로 Supabase 에 싣는다(sink.mjs).
싣기는 표마다 통째 교체(delete+insert, 한 트랜잭션)라 멱등이다. 두 기기가 같이 돌면 나중에 끝난 쪽 값이 남는다.
합쳐진 판(sg-merge)에 머지된 뒤에 설치한다 — 그 전엔 그 자리에 새 publish.mjs 가 없다.

쥔님이 한 번 넣을 것 (둘 다 값은 레포·로그에 안 남는다):
  1) 키 — 맥 터미널 한 줄(값 없이 -w 로 끝내면 프롬프트로 받는다):
     security add-generic-password -a "$USER" -s board-reporter-supabase -w
  2) 프로젝트 REF(비밀 아님) — ../config.mac.json 의 "ref" 칸에 적는다(또는 환경변수 BOARD_SUPABASE_REF).
  환경변수 BOARD_SUPABASE_TOKEN 이 있으면 키체인보다 먼저 읽는다.
  자격이 없으면 로그에 「자격 없음 — 싣기 건너뜀」 한 줄 + 종료코드 3(git 으로 되돌아가지 않는다).

설치(맥 터미널 한 줄):
  sed "s|__HOME__|$HOME|g" "$HOME/Desktop/gne-dev-task/sg-merge/board/reporter/mac/board-reporter.plist" > "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist" && launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist"

제거:
  launchctl bootout "gui/$(id -u)/kr.gne.board-reporter" && rm "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist"

상태/로그: launchctl print "gui/$(id -u)/kr.gne.board-reporter" | head ; tail "$HOME/Library/Logs/board-reporter.log"

업무 PC(윈도우) 메모:
  board-reporter.vbs 는 레포 밖(D:\gne-dev-task\)이라 여기서 못 고친다. 업무 PC 가 이 커밋을 받으면
  publish.mjs 는 git push 없이 sink.mjs 로 Supabase 에 직접 싣는다.
  키 자리: %LOCALAPPDATA%\board-reporter\token (한 줄 파일, 사용자 폴더 밖 노출 없이) 또는 환경변수 BOARD_SUPABASE_TOKEN.
  REF 는 config.win.json 의 "ref" 칸(없으면 환경변수 BOARD_SUPABASE_REF).
