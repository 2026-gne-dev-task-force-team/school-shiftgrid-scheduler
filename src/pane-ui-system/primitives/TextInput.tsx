/**
 * TextInput — 한 줄 입력칸. 설정·플러그인이 손으로 짜던 `h-btn px-2 rounded border …` 꼴 한 벌.
 *   input prop 은 그대로 넘긴다(type·value·onChange·placeholder …). 숫자 오른쪽 정렬은 className 으로.
 */
import type { InputHTMLAttributes } from 'react';
import { FOCUS_RING } from './focus';

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`h-btn px-2 rounded border border-line bg-bg text-text text-body ${FOCUS_RING} ${className}`} {...rest} />;
}
