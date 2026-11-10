// 테스트 기본 플랫폼 = 맥(옛 테스트가 ⌘ 로 쓰였다). 윈도우 흉내는 테스트 안에서 setPlatform('win') 으로 켠다(W14).
import { beforeEach } from 'vitest';
import { setPlatform } from './pane-ui-system/platform-keys';
beforeEach(() => setPlatform('mac'));
