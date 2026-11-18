// 자동 생성 웹 워커 — 화면 뒤에서 best-of-8 을 돌리고 진행·결과를 메인으로 보낸다.
import { generate } from './core.js';
import { makeSoftScore } from './soft-adapter.js';

self.onmessage = (e) => {
  const { input, k = 8, perMs = 3000, seed = Date.now() % 100000 } = e.data || {};
  try {
    const r = generate(input, { k, perMs, seed, softScore: makeSoftScore(input), onProgress: (p) => self.postMessage({ type: 'progress', ...p }) });
    self.postMessage({ type: 'done', ...r });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
