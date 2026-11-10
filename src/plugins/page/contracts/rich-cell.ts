/**
 * 🔴 rich-cell 약속 — 짧은 글 한 토막(시트 칸·시간표 칸·속성 값)을 「작은 마크다운 + 노드 칩」으로 그리는 부품(쥔님 11-10).
 *   저장은 손님 몫이고 **글자 그대로**다 — 이 약속은 그리기와 `@` 고르기만 준다.
 *   문법: `**굵게**` · `*기울임*` · `~~취소선~~` · 줄바꿈 · `[글](https://…)` · `[글]{.accent|ok|bad|warn|muted}` · 노드 칩 `⟦node:<id>⟧`.
 *   칩 모습은 노드 쪽이 정한다(nodes.Chip — 타입이 chip 을 등록했으면 그 모습, 없으면 아이콘+이름).
 *   ⛔ 손님은 이 타입만 import type 한다(값은 host.modules.use('rich-cell')).
 */
import type { ComponentType } from 'react';

export interface RichTextProps {
    text: string;
    className?: string;
    /** 칩을 눌러도 안 연다(미리보기 등) */
    readOnly?: boolean;
}

export interface NodePickerProps {
    /** 띄울 자리(보통 편집창의 getBoundingClientRect) */
    anchor: DOMRect;
    onPick(nodeId: string): void;
    onClose(): void;
}

export interface RichCellApi {
    version: 1;
    /** 리치 글자 그리기 — 서식 없는 글자는 맨 글자 그대로 */
    RichText: ComponentType<RichTextProps>;
    /** 노드 고르기 팝오버(이름으로 거르기 · ↑↓ Enter · Esc) — 칸 편집 중 `@` 가 띄운다 */
    NodePicker: ComponentType<NodePickerProps>;
    /** 노드 하나를 가리키는 토큰 글자 */
    token(nodeId: string): string;
    /** 글자 속 노드 id 전부(나온 차례 · 겹치면 한 번) */
    nodeIdsIn(text: string): string[];
    /** 서식을 벗긴 읽기 글자(칩은 노드 이름) */
    toPlain(text: string): string;
}
