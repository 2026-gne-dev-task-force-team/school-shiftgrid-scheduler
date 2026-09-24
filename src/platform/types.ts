/**
 * Platform — 화면이 '바깥 세상'(파일·인쇄·클립보드)에 손대는 유일한 문. 계약이다.
 * Electron 이면 preload 가 window.platform 으로 실물을 꽂고, 웹이면 localStorage/다운로드로 흉내 낸다.
 * ⛔ 화면은 Electron API 를 직접 부르지 않는다. 이 인터페이스만 안다.
 */
import type { Doc } from '../types/doc';

export interface OpenedDoc { doc: Doc; path?: string; }

export interface Platform {
    kind: 'electron' | 'web';
    /** 파일 고르기 창을 띄워 Doc 을 읽는다. 취소하면 null */
    openDoc(): Promise<OpenedDoc | null>;
    /** path 가 있으면 거기 덮어쓰고, 없으면 「다른 이름으로」 창. 취소하면 null, 성공하면 경로 */
    saveDoc(doc: Doc, path?: string): Promise<string | null>;
    /** 항상 「다른 이름으로」 */
    saveDocAs(doc: Doc): Promise<string | null>;
    /** 마지막 작업본을 조용히 보관 (앱을 다시 열면 복구 제안). 실패해도 던지지 않는다 */
    autosave(doc: Doc): Promise<void>;
    /** 자동 보관본이 있으면 돌려준다 */
    loadAutosave(): Promise<Doc | null>;
    /** 임의 파일 내보내기 (CSV·xlsx). bytes 는 문자열이거나 바이너리 */
    exportFile(name: string, data: string | Uint8Array, mime?: string): Promise<void>;
    /** 파일 하나 읽기 (엑셀 불러오기). 취소하면 null */
    importFile(accept: string): Promise<{ name: string; bytes: Uint8Array } | null>;
    /** 브라우저 인쇄 */
    print(): Promise<void>;
    /** 최근 연 파일 경로들 (웹이면 빈 배열) */
    recentFiles(): Promise<string[]>;
}
