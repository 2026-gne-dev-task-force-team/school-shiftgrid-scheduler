/**
 * 컴포넌트 공통 인터페이스 — 「유니티의 컴포넌트처럼」(쥔님 2026-10-19).
 * 꽂고 → 속성을 만지고 → 「적용」을 누르면 그 순간 표(rows/cols)가 바뀐다.
 * 🔴 컴포넌트는 표를 쓰지 소유하지 않는다 — apply 는 새 표를 돌려줄 뿐, 인스턴스 자체는 표가 들고 있는다.
 */
import type { ComponentType } from 'react';
import type { Sheet } from '../model';

export interface SheetComponentDef<P extends Record<string, unknown> = Record<string, unknown>> {
    /** 레지스트리 키 — ComponentInstance.componentId 와 같다 */
    id: string;
    /** 도구 상자·꽂기 목록에 보일 이름. 🔴 「교시」 낱말을 피한다 */
    title: string;
    defaultProps: P;
    /** 적용 — 지금 표와 속성값을 받아 새 표(rows/cols/cells)를 돌려준다. 순수 함수 */
    apply: (sheet: Sheet, props: P) => Sheet;
}

/** 속성 폼에 넘기는 것 — 지금 값과, 바뀐 부분만 올리는 onChange */
export interface ComponentFormProps<P extends Record<string, unknown> = Record<string, unknown>> {
    props: P;
    onChange: (patch: Partial<P>) => void;
}

export interface ComponentRegistryEntry<P extends Record<string, unknown> = Record<string, unknown>> {
    def: SheetComponentDef<P>;
    Form: ComponentType<ComponentFormProps<P>>;
}
