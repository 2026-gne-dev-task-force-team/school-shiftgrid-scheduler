/**
 * 「account」 신분증 — 계정 제공자. id 는 폴더명과 같다(구조 검사 ⑧).
 *   제공: identity(누구)·permit(판정) · 지원: credential(증명 · 없어도 켜진다) · 필요: nodes(계정 데이터를 레코드 노드로).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'account',
    name: '계정',
    version: '0.1.0',
    minHostVersion: '0.1.0',
    description: '계정 — 누구(identity)·판정(permit) 제공. 마스터·프로젝트 암호·역할·정책(바닥 정책 0 · 실수 방지용 화면 가림).',
};
