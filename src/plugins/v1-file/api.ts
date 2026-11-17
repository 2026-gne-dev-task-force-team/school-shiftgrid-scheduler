/**
 * 🔴 v1-file 인터페이스 모듈 — manifest.provides['v1-file'] 와 짝.
 */
import { CMD } from './contracts/v1-file';
import type { V1File } from './contracts/v1-file';

export const v1FileApi: V1File = { version: 1, cmd: CMD };
