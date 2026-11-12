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

----------------------------------------------------------------------
T-9r U7 — 상주 감시꾼 watch.mjs (2분 시계 → 파일 바뀌면 즉시)
----------------------------------------------------------------------
watch.mjs 가 원천(레인 폴더 · 한도 파일 · actors.json · 가지 목록)을 fs.watch 로 보다가, 마지막 바뀜 뒤 3초에 한 번 싣는다.
직전 성공 스냅숏과 내용이 같으면(시각 칸 빼고 비교) 안 싣는다 — 해시는 last-sink.json 옆 last-hash.json.
2분 예비 타이머가 놓친 변화를 줍는다(토큰 로그는 감시 안 하고 이 타이머가 줍는다). 같아도 20분마다 한 번은 싣는다(「자료 싣기」 표지가 멈춤으로 안 읽히게).
감시꾼이 뜨면 옛 2분 시계(kr.gne.board-reporter)는 끈다 — 둘 다 켜 두면 옛 시계가 2분마다 해시 없이 싣는다.

맥 설치(옛 시계 끄기 + 감시꾼 켜기, 한 줄씩):
  launchctl bootout "gui/$(id -u)/kr.gne.board-reporter"
  sed "s|__HOME__|$HOME|g" "$HOME/Desktop/gne-dev-task/sg-merge/board/reporter/mac/board-watcher.plist" > "$HOME/Library/LaunchAgents/kr.gne.board-watcher.plist" && launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/kr.gne.board-watcher.plist"

맥 제거(감시꾼 끄고 옛 시계로 되돌리기):
  launchctl bootout "gui/$(id -u)/kr.gne.board-watcher" && rm "$HOME/Library/LaunchAgents/kr.gne.board-watcher.plist"
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/kr.gne.board-reporter.plist"

상태/로그: launchctl print "gui/$(id -u)/kr.gne.board-watcher" | head ; tail "$HOME/Library/Logs/board-watcher.log"

업무 PC(윈도우, 관리자 아닌 PowerShell 한 덩이 — 경로는 PC 에 맞게 고친다. 옛 예약 작업을 지우고 「로그온 시 상주」로):
  $n = "C:\Program Files\nodejs\node.exe"; $w = "D:\gne-dev-task\sg-merge\board\reporter\watch.mjs"
  Unregister-ScheduledTask -TaskName "board-reporter" -Confirm:$false
  Register-ScheduledTask -TaskName "board-watcher" -Action (New-ScheduledTaskAction -Execute $n -Argument "`"$w`"") -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable) ; Start-ScheduledTask -TaskName "board-watcher"
  (옛 작업 이름이 board-reporter 가 아니면 Get-ScheduledTask 로 확인해 그 이름을 쓴다. 창이 뜨는 게 싫으면 옛 .vbs 처럼 숨김 실행으로 감싼다.)
