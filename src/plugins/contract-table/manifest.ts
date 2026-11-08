/**
 * 약속 플러그인 「contract-table」 신분증 — 약속 1장(table). id 는 폴더명과 같다(구조 검사 ⑧).
 *   ⭐ core:true — 쥔님 2026-11-08 16:20 *"완전 범용 바닥"*. 플러그인끼리 값 import 금지(⑧)라
 *      손님이 Table 을 받는 길은 약속뿐이라, 범용 바닥은 코어로 박는다(contract-nodes 와 같은 꼴).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'contract-table',
    name: '약속: 표',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    core: true,
    description: '범용 표 편집기 약속(table 0.1) — (r,c) 뷰 좌표·TSV·트랜잭션. 타입만(모듈 0·화면 0). 제공자: table-editor.',
};
