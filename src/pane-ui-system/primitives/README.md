# 공통 부품 (primitives)

화면의 단추·입력칸은 **여기 부품만** 쓴다. 맨 `<button> <input> <select> <textarea> <label>` 은 쓰지 않는다.
모양을 바꾸고 싶으면 사용처가 아니라 **여기(또는 theme 토큰)** 를 고친다 — 그래야 전체가 한 번에 바뀐다.
새 파일에 맨 요소를 쓰면 `npm run lint`(와 테스트 `__tests__/lint.test.ts`)가 빨강을 낸다. 예외는 `.oxlintrc.json` overrides(업무 PC 영역·시험대 — 줄이기만 한다), 아니면 그 줄 위에 `// oxlint-disable-next-line react/forbid-elements -- 이유`(JSX 안이면 `{/* … */}`).

## 낱말 세 개면 끝
| prop | 값 | 기본 |
|---|---|---|
| size | sm(24) · md(28) | md (IconButton·Segmented 는 sm) |
| variant | solid · soft · ghost · outline | soft |
| tone | neutral · accent · danger | neutral |

이름표는 언제나 `label`. 켜고 끄는 것은 `checked` + `onChange(값)`.

## 고르는 법
- 단추: 화면의 주 동작 하나만 `variant="solid" tone="accent"`. 나머지는 기본, 도구 막대는 ghost.
- 지우기처럼 되돌리기 힘든 일: `tone="danger"`.
- 아이콘만: `IconButton icon="…" label="…"` (label 필수 — 읽어 주는 이름).
- 이름표+칸: `Field label hint error` 로 감싼다. 칸 종류는 TextInput · Textarea · NumberInput · Select · Checkbox · Toggle · Segmented · RadioGroup.
- 상태 글자: Badge(뜻색) · Pill(사용자가 고른 장식 색).

## 예
    <Button tone="accent" variant="solid" onClick={save}>저장</Button>
    <Field label="이름"><TextInput value={v} onChange={(e) => setV(e.target.value)} /></Field>
    <Checkbox label="고정" checked={pin} onChange={setPin} />

## 고칠 때
- 색은 토큰 이름만(`bg-accent/10` 처럼 투명도로). 새 색 토큰 ⛔.
- 높이 `h-btn`/`h-field`, 모서리 `rounded-ctl`, 초점 `FOCUS_RING`/`FOCUS_FIELD`(focus.ts).
- 클래스는 완성 문자열로(이어붙이기 ⛔ — Tailwind 가 못 읽는다).
- 부품마다 새 prop 을 늘리기 전에: 이미 있는 세 낱말로 되나 먼저 본다.
