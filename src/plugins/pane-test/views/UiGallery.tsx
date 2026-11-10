/**
 * 「부품 견본」 — 공통 부품(primitives)을 한 화면에 늘어놓고 모양을 눈으로 판정하는 뷰(U-견본).
 *   위에서 테마·밀도·글자 크기를 바꿔 보며 본다(기존 설정 useTheme 재사용 — 설정 「모양」 판과 같은 저장소).
 *   🔴 날 요소(button·input·select·textarea·label) 0 — 부품만 쓴다. 색은 토큰 클래스로만. 견본 문구는 일반어.
 */
import { useState } from 'react';
import {
    Button, IconButton, Toggle, TextInput, Select, Textarea, NumberInput, Checkbox, Segmented, RadioGroup,
    Field, Badge, Pill, PILL_COLORS, useTheme, THEMES, DENSITIES, FONT_SIZES,
} from '../../../pane-ui-system';
import type { ThemeMode, DensityId, FontSizeId } from '../../../pane-ui-system';

const VARIANTS = ['solid', 'soft', 'ghost', 'outline'] as const;
const TONES = ['neutral', 'accent', 'danger'] as const;
const SIZES = ['sm', 'md'] as const;

const FRUIT = [
    { value: 'apple', label: '사과' },
    { value: 'pear', label: '배' },
    { value: 'plum', label: '자두', disabled: true },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-note font-semibold uppercase tracking-wide text-muted">{title}</h3>
            <div className="flex flex-col gap-3 rounded-ctl border border-line bg-panel p-3">{children}</div>
        </section>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-small text-muted">{label}</span>
            {children}
        </div>
    );
}

export function UiGallery() {
    const { settings, setSettings } = useTheme();
    const [text, setText] = useState('');
    const [area, setArea] = useState('');
    const [num, setNum] = useState<number | null>(3);
    const [pick, setPick] = useState('apple');
    const [on, setOn] = useState(true);
    const [chk, setChk] = useState(true);
    const [seg, setSeg] = useState('day');
    const [radio, setRadio] = useState('a');

    return (
        <div className="h-full overflow-auto p-5 flex flex-col gap-5 bg-bg text-text">
            <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">부품 견본</h2>
                <p className="text-small text-muted">공통 부품을 한 화면에 모았습니다. 위에서 테마·밀도를 바꿔 모양을 확인하세요.</p>
            </header>

            <Section title="테마 · 밀도">
                <Row label="밝기">
                    <Segmented<ThemeMode>
                        label="밝기"
                        value={settings.mode}
                        onChange={(mode) => setSettings({ mode })}
                        options={[{ value: 'system', label: '시스템' }, { value: 'light', label: '밝게' }, { value: 'dark', label: '어둡게' }]}
                    />
                </Row>
                <Row label="테마">
                    <Select
                        label="테마"
                        value={settings.theme}
                        onChange={(e) => setSettings({ theme: e.target.value })}
                        options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
                    />
                </Row>
                <Row label="밀도">
                    <Segmented<DensityId>
                        label="밀도"
                        value={settings.density}
                        onChange={(density) => setSettings({ density })}
                        options={DENSITIES.map((d) => ({ value: d.id, label: d.name }))}
                    />
                </Row>
                <Row label="글자 크기">
                    <Segmented<FontSizeId>
                        label="글자 크기"
                        value={settings.fontSize}
                        onChange={(fontSize) => setSettings({ fontSize })}
                        options={FONT_SIZES.map((f) => ({ value: f.id, label: f.name }))}
                    />
                </Row>
            </Section>

            <Section title="Button — 변형 4 × 색 3 × 크기 2">
                {SIZES.map((size) => (
                    <div key={size} className="flex flex-col gap-2">
                        <span className="text-small text-muted">size {size}</span>
                        {VARIANTS.map((variant) => (
                            <Row key={variant} label={variant}>
                                {TONES.map((tone) => (
                                    <Button key={tone} size={size} variant={variant} tone={tone}>{tone}</Button>
                                ))}
                            </Row>
                        ))}
                    </div>
                ))}
                <Row label="icon · end">
                    <Button icon="plus">추가</Button>
                    <Button icon="download" variant="outline" end={<Badge>3</Badge>}>내려받기</Button>
                </Row>
                <Row label="loading · disabled">
                    <Button loading>저장 중</Button>
                    <Button variant="solid" tone="accent" loading>저장 중</Button>
                    <Button disabled>사용 불가</Button>
                    <Button variant="solid" tone="accent" disabled>사용 불가</Button>
                </Row>
                <Button block variant="solid" tone="accent">block — 한 줄을 꽉 채움</Button>
            </Section>

            <Section title="IconButton">
                <Row label="ghost">
                    {TONES.map((tone) => (
                        <IconButton key={tone} icon="gear" label={`설정 ${tone}`} tone={tone} />
                    ))}
                    <IconButton icon="gear" label="설정 눌림" active />
                    <IconButton icon="gear" label="설정 사용 불가" disabled />
                </Row>
                <Row label="soft">
                    {TONES.map((tone) => (
                        <IconButton key={tone} icon="trash" label={`삭제 ${tone}`} variant="soft" tone={tone} />
                    ))}
                </Row>
                <Row label="size md">
                    <IconButton icon="search" label="검색" size="md" />
                    <IconButton icon="search" label="검색 soft" size="md" variant="soft" />
                </Row>
            </Section>

            <Section title="입력류 — sm / md">
                {SIZES.map((size) => (
                    <Row key={size} label={`size ${size}`}>
                        <TextInput size={size} label="글자 입력" placeholder="글자 입력" value={text} onChange={(e) => setText(e.target.value)} />
                        <NumberInput size={size} label="숫자 입력" value={num} onChange={setNum} min={0} max={10} suffix="개" />
                        <Select size={size} label="고르기" value={pick} onChange={(e) => setPick(e.target.value)} options={FRUIT} />
                        <Toggle size={size} label="켜기" checked={on} onChange={setOn} />
                        <Checkbox size={size} label="확인" checked={chk} onChange={setChk} />
                    </Row>
                ))}
                <Textarea label="여러 줄 입력" placeholder="여러 줄 입력" rows={2} value={area} onChange={(e) => setArea(e.target.value)} />
            </Section>

            <Section title="상태 — invalid · disabled">
                <Row label="invalid">
                    <TextInput label="잘못된 글자" invalid defaultValue="잘못된 값" />
                    <NumberInput label="잘못된 숫자" invalid value={99} onChange={() => {}} />
                    <Select label="잘못된 선택" invalid value="apple" onChange={() => {}} options={FRUIT} />
                </Row>
                <Row label="disabled">
                    <TextInput label="잠긴 글자" disabled defaultValue="잠긴 값" />
                    <NumberInput label="잠긴 숫자" disabled value={5} onChange={() => {}} />
                    <Select label="잠긴 선택" disabled value="apple" onChange={() => {}} options={FRUIT} />
                    <Toggle label="잠긴 켜기" disabled checked onChange={() => {}} />
                    <Checkbox label="잠긴 확인" disabled checked onChange={() => {}} />
                </Row>
            </Section>

            <Section title="Field — stack / row">
                <Field label="이름" hint="알아보기 쉬운 이름을 적습니다.">
                    <TextInput value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <Field label="수량" error="0 이상이어야 합니다." required>
                    <NumberInput value={-1} onChange={() => {}} />
                </Field>
                <Field label="이름" layout="row" hint="row — 이름표 왼쪽, 칸 오른쪽">
                    <TextInput value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <Field label="종류" layout="row" error="하나를 골라야 합니다.">
                    <Select value="" onChange={() => {}} placeholder="선택" options={FRUIT} />
                </Field>
            </Section>

            <Section title="Checkbox · Radio · Segmented">
                <Row label="Checkbox">
                    <Checkbox label="선택됨" checked onChange={() => {}} />
                    <Checkbox label="선택 안 됨" checked={false} onChange={() => {}} />
                    <Checkbox label="일부 선택" checked={false} indeterminate onChange={() => {}} />
                </Row>
                <Row label="RadioGroup">
                    <RadioGroup label="가로 고르기" direction="row" value={radio} onChange={setRadio}
                        options={[{ value: 'a', label: '가' }, { value: 'b', label: '나' }, { value: 'c', label: '다' }]} />
                </Row>
                <RadioGroup label="세로 고르기" value={radio} onChange={setRadio}
                    options={[{ value: 'a', label: '가', hint: '설명이 붙는 항목' }, { value: 'b', label: '나' }]} />
                <Row label="Segmented sm">
                    <Segmented label="기간 sm" value={seg} onChange={setSeg}
                        options={[{ value: 'day', label: '일' }, { value: 'week', label: '주' }, { value: 'month', label: '월' }]} />
                </Row>
                <Row label="Segmented md">
                    <Segmented size="md" label="기간 md" value={seg} onChange={setSeg}
                        options={[{ value: 'day', label: '일', icon: 'calendar' }, { value: 'week', label: '주' }, { value: 'month', label: '월' }]} />
                </Row>
            </Section>

            <Section title="Badge · Pill">
                <Row label="Badge soft">
                    {TONES.map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}
                </Row>
                <Row label="Badge outline">
                    {TONES.map((tone) => <Badge key={tone} tone={tone} variant="outline">{tone}</Badge>)}
                </Row>
                <Row label="Pill">
                    {PILL_COLORS.map((c) => <Pill key={c} color={c}>{c}</Pill>)}
                </Row>
            </Section>
        </div>
    );
}
