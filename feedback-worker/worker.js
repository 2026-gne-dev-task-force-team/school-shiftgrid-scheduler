/**
 * 의견 창구 중계 — 앱의 「의견 보내기」를 받아 GitHub 이슈로 만든다. (Cloudflare Worker · 무료 요금제)
 *
 *  왜 중계가 필요한가: 선생님은 GitHub 계정이 없다. 브라우저 앱에 토큰을 박으면 누구나 꺼내 쓸 수 있으므로,
 *  토큰은 여기(Worker 비밀값)에만 살고 앱은 이 주소로 JSON 만 보낸다.
 *
 *  ⭐ 이 코드는 특정 사람의 계정에 묶이지 않는다 — 저장소에 살고 GitHub Actions(.github/workflows/feedback-worker.yml)가 배포한다.
 *     후임은 docs/의견 창구 인수인계.md 대로 비밀값 3개만 저장소 설정에 넣으면 된다.
 *
 *  env (wrangler.toml · Actions 가 넣는다)
 *    GITHUB_TOKEN     비밀 — fine-grained PAT. 대상 저장소에 Issues: write · Contents: write
 *    GITHUB_REPO      "조직/저장소" — 이슈와 캡처가 들어갈 곳. ⭐ 비공개 저장소를 권한다(캡처에 실명이 보일 수 있다)
 *    ATTACH_BRANCH    캡처를 커밋할 브랜치 (기본 "attachments"). 없으면 만든다
 *    ALLOWED_ORIGINS  쉼표로 여러 개. 앱이 사는 주소만 받는다
 *
 *  요청  POST /  { kind, title, body, where, meta, images:[{name, dataUrl}] }
 *  응답  { ok:true, url, number } | { ok:false, error }
 */

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;   // 3 MB / 장
const MAX_BODY_CHARS = 20000;
const LABELS = { bug: '오류 제보', feature: '개선 요청', question: '질문' };

export default {
    async fetch(req, env) {
        const origin = req.headers.get('Origin') || '';
        const cors = corsHeaders(origin, env);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (req.method === 'GET') return json({ ok: true, service: 'shiftgrid-feedback', repo: env.GITHUB_REPO }, 200, cors);
        if (req.method !== 'POST') return json({ ok: false, error: 'POST 만 받습니다' }, 405, cors);
        if (!isAllowed(origin, env)) return json({ ok: false, error: '허용되지 않은 출처입니다' }, 403, cors);
        if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ ok: false, error: '중계가 아직 설정되지 않았습니다' }, 503, cors);

        let p;
        try { p = await req.json(); } catch { return json({ ok: false, error: 'JSON 이 아닙니다' }, 400, cors); }
        if (p.honey) return json({ ok: true, url: '', number: 0 }, 200, cors);   // 봇 함정 — 조용히 삼킨다

        const kind = LABELS[p.kind] ? p.kind : 'feature';
        const title = String(p.title || '').trim().slice(0, 120) || `${LABELS[kind]} (제목 없음)`;
        const body = String(p.body || '').trim().slice(0, MAX_BODY_CHARS);
        if (!body) return json({ ok: false, error: '내용이 비어 있습니다' }, 400, cors);
        const images = Array.isArray(p.images) ? p.images.slice(0, MAX_IMAGES) : [];

        try {
            // 1) 캡처를 저장소 브랜치에 커밋하고 raw 주소를 얻는다
            const links = [];
            for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(img.dataUrl || ''));
                if (!m) continue;
                const b64 = m[3];
                if (b64.length * 0.75 > MAX_IMAGE_BYTES) continue;
                const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
                const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
                const path = `feedback/${stamp}-${i + 1}.${ext}`;
                const url = await putFile(env, path, b64, `의견 캡처 ${stamp}`);
                if (url) links.push({ name: img.name || `캡처 ${i + 1}`, url });
            }

            // 2) 이슈 본문
            const meta = p.meta && typeof p.meta === 'object' ? p.meta : {};
            const lines = [
                `**종류**: ${LABELS[kind]}`,
                p.where ? `**화면**: ${String(p.where).slice(0, 200)}` : '',
                '',
                body,
                '',
                ...links.map((l) => `![${l.name}](${l.url})`),
                links.length ? '' : '',
                '---',
                '<details><summary>환경</summary>',
                '',
                '```',
                ...Object.entries(meta).slice(0, 20).map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`),
                '```',
                '</details>',
            ];
            const issue = await gh(env, `/repos/${env.GITHUB_REPO}/issues`, 'POST', {
                title, body: lines.join('\n'), labels: [LABELS[kind], '앱에서 보냄'],
            });
            if (!issue || !issue.html_url) return json({ ok: false, error: 'GitHub 가 이슈를 만들지 못했습니다' }, 502, cors);
            return json({ ok: true, url: issue.html_url, number: issue.number }, 200, cors);
        } catch (e) {
            return json({ ok: false, error: `중계 오류: ${e && e.message ? e.message : String(e)}` }, 502, cors);
        }
    },
};

function corsHeaders(origin, env) {
    return {
        'Access-Control-Allow-Origin': isAllowed(origin, env) ? origin : 'null',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}
function isAllowed(origin, env) {
    const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return true;                       // 설정 안 했으면 모두 허용(시험용)
    return list.includes(origin);
}
function json(obj, status, headers) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

async function gh(env, path, method, bodyObj) {
    const r = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'shiftgrid-feedback-worker',
            'Content-Type': 'application/json',
        },
        body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { /* 빈 응답 */ }
    if (!r.ok) throw new Error(`GitHub ${r.status} ${method} ${path}: ${(data && data.message) || text.slice(0, 200)}`);
    return data;
}

/** 파일을 첨부 브랜치에 커밋하고 raw 주소를 돌려준다. 브랜치가 없으면 기본 브랜치에서 갈라 만든다 */
async function putFile(env, path, b64, message) {
    const branch = env.ATTACH_BRANCH || 'attachments';
    await ensureBranch(env, branch);
    const res = await gh(env, `/repos/${env.GITHUB_REPO}/contents/${path}`, 'PUT', { message, content: b64, branch });
    // 비공개 저장소의 raw 는 로그인한 사람(이슈를 볼 수 있는 사람)에게만 보인다 — 그게 의도다
    return res && res.content ? `https://github.com/${env.GITHUB_REPO}/blob/${branch}/${path}?raw=true` : null;
}
async function ensureBranch(env, branch) {
    try { await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${branch}`, 'GET'); return; } catch { /* 없다 */ }
    const repo = await gh(env, `/repos/${env.GITHUB_REPO}`, 'GET');
    const base = await gh(env, `/repos/${env.GITHUB_REPO}/git/ref/heads/${repo.default_branch}`, 'GET');
    await gh(env, `/repos/${env.GITHUB_REPO}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: base.object.sha });
}
