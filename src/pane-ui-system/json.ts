/** JSON 으로 그대로 저장·전달되는 값 — 명령 맥락(args)·알림 단추가 싣는 「데이터뿐」인 꼴(함수 금지). */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
