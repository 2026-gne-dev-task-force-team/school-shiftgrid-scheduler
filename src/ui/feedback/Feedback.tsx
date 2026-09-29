/**
 * 의견 창구 — 오른쪽 아래 「의견 보내기」 단추 + 보내기 창.
 *  · 어느 화면에서 눌렀는지(7단계 + 기초자료 소절)가 자동으로 붙는다.
 *  · 캡처: 화면 캡처(브라우저 화면 공유 API) · 파일 첨부 · Ctrl+V 붙여넣기. 최대 4장.
 *  · 보내기: 중계(FEEDBACK_URL)로 → GitHub 이슈. 중계가 없거나 실패하면 제보문+캡처를 HTML 파일 하나로 내려준다(서버 0 경로).
 *  ⛔ 학교 자료(작업 파일)는 보내지 않는다. 개수만 붙는다.
 */
import { useRef, useState, type ClipboardEvent } from 'react';
import { useStore } from '../../store/store';
import { SCREENS } from '../screens';
import { Icon } from '../parts/Icon';
import { Button, Modal, Field, TextInput, Select, Mark } from '../parts/ui';
import { platform } from '../../platform';
import { FEEDBACK_URL, ISSUES_URL } from './config';
import { captureScreen, canCaptureScreen, fileToDataUrl, type Shot } from './capture';
import { getTheme } from '../help/theme';

type Kind = 'feature' | 'bug' | 'question';
const KIND_LABEL: Record<Kind, string> = { feature: '개선 요청', bug: '오류 제보', question: '질문' };
const APP_VERSION = (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? '';

// ── 단추 ──────────────────────────────────────────────────────
export function FeedbackButton() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)} data-tour="feedback-button" title="개선 요청·오류 제보를 보냅니다"
                className="no-print fixed z-[90] right-3 md:right-4 bottom-12 md:bottom-10 inline-flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg
                           bg-accent hover:bg-accenth text-white text-[13px] font-medium">
                <Icon name="help" size={15} />
                <span className="hidden sm:inline">의견 보내기</span>
            </button>
            {open && <FeedbackModal onClose={() => setOpen(false)} />}
        </>
    );
}

// ── 어디서 눌렀나 ─────────────────────────────────────────────
function whereNow(screen: string): string {
    const s = SCREENS.find((x) => x.id === screen);
    const parts = [s ? s.title : (screen === 'home' ? '홈' : screen)];
    if (screen === 'basic') {
        const active = [...document.querySelectorAll<HTMLElement>('[data-tour="basic-subtabs"] button')]
            .find((b) => b.className.includes('bg-accent') && b.getBoundingClientRect().width > 0);
        if (active) parts.push(active.textContent?.trim() ?? '');
    }
    return parts.filter(Boolean).join(' › ');
}

// ── 창 ────────────────────────────────────────────────────────
function FeedbackModal({ onClose }: { onClose: () => void }) {
    const st = useStore();
    const [kind, setKind] = useState<Kind>('feature');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [shots, setShots] = useState<Shot[]>([]);
    const [busy, setBusy] = useState<'' | 'capture' | 'send'>('');
    const [done, setDone] = useState<{ url?: string; file?: string } | null>(null);
    const [err, setErr] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const where = whereNow(st.screen);
    const isWeb = platform.kind === 'web';

    // 창을 연 채로 Ctrl+V 하면 클립보드 이미지가 붙는다
    const onPaste = async (e: ClipboardEvent) => {
        const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        const f = item.getAsFile(); if (!f) return;
        const s = await fileToDataUrl(f, `붙여넣기 ${shots.length + 1}`); if (s) addShot(s);
    };
    const addShot = (s: Shot) => setShots((prev) => (prev.length >= 4 ? prev : [...prev, s]));

    const doCapture = async () => {
        setErr(''); setBusy('capture');
        try {
            // 캡처 창이 이 창을 가리지 않게 잠깐 숨긴다
            const s = await captureScreen();
            if (s) addShot(s);
        } catch (e) { setErr(`캡처하지 못했습니다: ${msgOf(e)} — 대신 파일 첨부나 붙여넣기를 쓰세요.`); }
        finally { setBusy(''); }
    };
    const doFiles = async (files: FileList | null) => {
        if (!files) return;
        for (const f of [...files].slice(0, 4)) { const s = await fileToDataUrl(f, f.name); if (s) addShot(s); }
    };

    const meta = () => ({
        version: APP_VERSION || '(빌드 정보 없음)',
        platform: platform.kind,
        screen: where,
        theme: getTheme(),
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        time: new Date().toLocaleString('ko-KR', { hour12: false }),
        data: `시간 틀 ${st.doc.specs.length} · 반 ${st.doc.tracks.length} · 교사 ${st.doc.agents.length} · 시수 ${st.doc.demands.length} · 수업 ${st.doc.assignments.length}`,
    });

    const send = async () => {
        if (!body.trim()) { setErr('내용을 적어 주세요.'); return; }
        setErr(''); setBusy('send');
        const payload = { kind, title: title.trim(), body: body.trim(), where, meta: meta(), images: shots };
        try {
            if (!FEEDBACK_URL) throw new Error('중계 주소가 설정되지 않았습니다');
            const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
            const r = await fetch(FEEDBACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
            clearTimeout(t);
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.ok) throw new Error(j.error || `응답 ${r.status}`);
            setDone({ url: j.url });
        } catch (e) {
            // 서버 0 경로 — 제보문+캡처를 파일 하나로 내려준다
            const name = downloadReport(payload);
            setDone({ file: name });
            setErr(`온라인으로 보내지 못해 파일로 내려받았습니다 (${msgOf(e)}). 파일을 담당자에게 메신저·메일로 보내 주세요.`);
        } finally { setBusy(''); }
    };

    if (done) {
        return (
            <Modal title="의견 보내기" onClose={onClose}>
                <div className="space-y-3 text-[13px]" onPaste={onPaste}>
                    <div className="flex items-start gap-2">
                        <Mark kind={done.url ? 'ok' : 'warn'} />
                        <div>
                            {done.url
                                ? <><div className="font-medium">접수되었습니다. 감사합니다.</div><div className="text-muted mt-1">담당자가 확인한 뒤 반영 여부를 앱 갱신으로 알려 드립니다.</div></>
                                : <><div className="font-medium">제보문을 파일로 내려받았습니다.</div><div className="text-muted mt-1">{err}</div><div className="text-muted mt-1">파일: <code className="text-text">{done.file}</code></div></>}
                        </div>
                    </div>
                    <div className="flex justify-end"><Button variant="primary" onClick={onClose}>닫기</Button></div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title="의견 보내기" onClose={onClose} wide>
            <div className="space-y-3 text-[13px]" onPaste={onPaste}>
                <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2">
                    <Field label="종류">
                        <Select value={kind} onChange={(v) => setKind(v as Kind)} className="w-full">
                            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                        </Select>
                    </Field>
                    <Field label="제목" hint="한 줄">
                        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 시수표에서 반을 고르면 학년이 지워집니다" className="w-full" />
                    </Field>
                </div>
                <Field label="내용" hint="무엇을 하려 했고 · 무엇이 나왔고 · 무엇을 기대했는지">
                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
                        placeholder={kind === 'bug' ? '1. 어느 화면에서\n2. 무엇을 눌렀더니\n3. 무엇이 나왔습니다 (기대: …)' : '이렇게 되면 좋겠습니다: …'}
                        className="w-full bg-panel2 border border-line rounded-md px-2 py-1.5 text-[13px] text-text placeholder:text-muted/60 outline-none focus:border-accent" />
                </Field>

                <div>
                    <div className="text-[12px] text-muted mb-1">캡처 <span className="text-muted/60">— 최대 4장 · 이 창을 연 채로 Ctrl+V 로 붙여넣어도 됩니다</span></div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {isWeb && canCaptureScreen() && (
                            <Button icon="copy" onClick={doCapture} disabled={busy !== '' || shots.length >= 4}>{busy === 'capture' ? '캡처 중…' : '화면 캡처'}</Button>
                        )}
                        <Button icon="upload" onClick={() => fileRef.current?.click()} disabled={shots.length >= 4}>파일 첨부</Button>
                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void doFiles(e.target.files); e.target.value = ''; }} />
                        {!isWeb && <span className="text-[12px] text-muted">앱에서는 PrtSc 로 찍어 Ctrl+V 로 붙여 주세요.</span>}
                    </div>
                    {shots.length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                            {shots.map((s, i) => (
                                <div key={i} className="relative w-28 h-20 rounded border border-line overflow-hidden bg-panel2">
                                    <img src={s.dataUrl} alt={s.name} className="w-full h-full object-cover" />
                                    <button onClick={() => setShots(shots.filter((_, j) => j !== i))} title="빼기"
                                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white grid place-items-center"><Icon name="x" size={11} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-md bg-panel2 border border-line p-2.5 text-[12px] text-muted space-y-0.5">
                    <div>자동으로 붙는 정보: 화면 「{where}」 · 버전 {APP_VERSION || '-'} · 브라우저 종류 · 자료 개수</div>
                    <div>학교 자료(시수표·이름)는 보내지 않습니다. 캡처에 실명이 보이면 가려 주세요. 담당자만 봅니다.</div>
                </div>

                {err && <div className="text-[12px] text-bad flex items-start gap-1"><Mark kind="bad" className="text-[11px]" /><span>{err}</span></div>}

                <div className="flex items-center gap-2 justify-end">
                    <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:text-accenth mr-auto">GitHub 계정이 있으면 직접 올리기 →</a>
                    <Button variant="soft" onClick={onClose}>취소</Button>
                    <Button variant="primary" icon="check" onClick={() => void send()} disabled={busy !== ''}>{busy === 'send' ? '보내는 중…' : '보내기'}</Button>
                </div>
            </div>
        </Modal>
    );
}

// ── 서버 0 경로: 제보문 + 캡처를 HTML 한 장으로 ──────────────
function downloadReport(p: { kind: Kind; title: string; body: string; where: string; meta: Record<string, string>; images: Shot[] }): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${esc(KIND_LABEL[p.kind])} — ${esc(p.title || '제목 없음')}</title>
<style>body{font-family:system-ui,"Malgun Gothic",sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1c2430}pre{white-space:pre-wrap;background:#f4f6f9;padding:12px;border-radius:8px}img{max-width:100%;border:1px solid #d5dbe3;border-radius:6px;margin:6px 0}table{border-collapse:collapse}td{padding:2px 8px;border-bottom:1px solid #eee;font-size:13px}</style>
<h1>${esc(KIND_LABEL[p.kind])}: ${esc(p.title || '제목 없음')}</h1>
<p><b>화면</b>: ${esc(p.where)}</p>
<pre>${esc(p.body)}</pre>
${p.images.map((s) => `<figure><img src="${s.dataUrl}" alt="${esc(s.name)}"><figcaption>${esc(s.name)}</figcaption></figure>`).join('\n')}
<h3>환경</h3><table>${Object.entries(p.meta).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`).join('')}</table>
<p style="color:#5f6b7a;font-size:12px">시간표 짜기 앱에서 만든 제보 파일입니다. 이 파일을 담당자에게 보내 주세요.</p></html>`;
    const d = new Date(); const two = (n: number) => String(n).padStart(2, '0');
    const name = `시간표짜기-의견-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.html`;
    void platform.exportFile(name, html, 'text/html;charset=utf-8');
    return name;
}

function msgOf(e: unknown): string { return e instanceof Error ? e.message : String(e); }
