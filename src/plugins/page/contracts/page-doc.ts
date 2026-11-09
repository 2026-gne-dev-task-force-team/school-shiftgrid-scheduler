/**
 * 🔴 page-doc 약속 — 다른 꾸러미가 자기 자료(레코드 줄 등)에 「페이지 문서」를 붙여 쓰는 편집기(쥔님 2026-11-09 「레코드마다 문서 노션처럼」).
 *   저장은 손님 몫 — value(불투명)를 주고 onChange 로 돌려받는다. 편집기는 그 값의 속을 손님에게 안 보인다.
 *   ⛔ 손님은 이 타입만 import type 한다(값은 host.modules.use('page-doc')).
 */
import type { ComponentType } from 'react';
import type { PluginHost } from '../../../pane-ui-system/plugin';

export interface PageDocProps {
    host: PluginHost;
    /** 문서 하나를 가리키는 안정 키 — 바뀌면 편집기가 새 문서로 다시 시작한다(되돌리기 더미도 새로). */
    docKey: string;
    /** 저장된 문서(불투명) — 없거나 모르는 꼴이면 빈 문서로 시작한다. */
    value: unknown;
    onChange(value: unknown): void;
    /** 머리 제목(손님이 이름을 쥔다) */
    title: string;
    onRename(name: string): void;
    /** 노드 공통 아이콘(손님이 쥔다) — onSetIcon 이 없으면 아이콘 고르기를 안 그린다. */
    icon?: string;
    onSetIcon?(icon: string | undefined): void;
}

export interface PageDocApi {
    version: 1;
    PageDoc: ComponentType<PageDocProps>;
}
