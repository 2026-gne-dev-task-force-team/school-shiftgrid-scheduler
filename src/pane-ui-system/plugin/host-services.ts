/**
 * 바닥(창틀)이 플러그인에게 주는 것의 설명 표 — 설정 「플러그인 > 플랫폼」이 그린다(P6a · R8).
 *   🔴 장치: 키 타입이 `keyof PluginHost` 라 `PluginHost` 에 칸을 늘리고 여기를 빼먹으면 tsc 가 빨강이다
 *      (거꾸로 없는 칸을 적어도 빨강). 설명이 비면 host-services.test.ts 가 빨강이다.
 */
import type { PluginHost } from './types';

export interface HostService { label: string; desc: string; example: string }

export const HOST_SERVICES: Record<keyof PluginHost, HostService> = {
    id: { label: '내 이름표', desc: '플러그인이 자기 id 를 아는 칸입니다.', example: '저장 키·알림 보낸이 표시에 쓰입니다' },
    hostVersion: { label: '바닥 판', desc: '지금 돌고 있는 바닥의 버전입니다.', example: '요구 판(minHostVersion)과 맞는지 가늠' },
    views: { label: '뷰 보기', desc: '등록된 화면(뷰)을 찾아 읽습니다. 등록은 매니페스트로만 합니다.', example: '설정 상세가 이 플러그인의 뷰 목록을 그림' },
    commands: { label: '명령 실행', desc: '「모든 동작은 명령」 — 리본·메뉴·팔레트가 같은 길로 명령을 부릅니다.', example: '휴지통 이동 알림의 「되돌리기」 단추' },
    menu: { label: '탭 메뉴 더하기', desc: '탭을 우클릭했을 때 뜨는 메뉴에 항목을 보탭니다.', example: '탐색기의 「이름 바꾸기」' },
    workspace: { label: '작업대', desc: '탭(뷰)을 열고 닫고, 열림·닫힘·활성 소식을 받습니다.', example: '달력이 일정 카드를 눌러 새 탭을 엶' },
    screen: { label: '화면 폭', desc: '좁은 화면인지 알려 주고 바뀔 때 소식을 줍니다.', example: '좁으면 사이드바를 접는 뷰' },
    theme: { label: '밝기(테마)', desc: '밝은/어두운 모드를 알려 주고 바뀔 때 소식을 줍니다.', example: '그림·차트가 색을 맞춤' },
    storage: { label: '기기 설정 저장', desc: '이 기기에만 남는 작은 설정값을 플러그인별 칸에 저장합니다.', example: '알림 보관 개수' },
    store: { label: '큰 자료 저장', desc: '브라우저 IndexedDB 에 큰 자료를 플러그인별로 저장합니다(5MB 천장 없음).', example: '탐색기 나무' },
    notify: { label: '알림', desc: '토스트로 잠깐 띄우고 알림 패널에 기록합니다. 단추는 명령 id 로만 답니다.', example: '저장 실패·휴지통 이동' },
    onFirstRun: { label: '첫 실행 훅', desc: '플러그인이 처음 켜질 때 딱 한 번 기본 배치를 만듭니다.', example: '처음 켠 달력이 빈 저장소를 만듦' },
    modules: { label: '약속(모듈) 쓰기', desc: '이름만 대고 다른 플러그인의 기능을 받습니다. 선언한 약속만 쓸 수 있습니다.', example: '명단이 레코드 뷰 약속을 빌림' },
    declare: { label: '동적 선언', desc: '실행 중에 뷰·명령 같은 기여를 하나 더 꽂습니다(매니페스트와 같은 검증).', example: '급조용 — 평소엔 매니페스트로' },
};
