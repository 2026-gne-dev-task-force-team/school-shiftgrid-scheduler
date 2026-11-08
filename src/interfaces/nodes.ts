/**
 * 🔴 인터페이스 「nodes」 — 노드 하이라키를 다루는 약속(제공자: 지금은 project-explorer, 나중엔 서버 저장소).
 *   ⭐ 소비자는 host.modules.use<NodesApi>('nodes') 로 받는다 — 누가 채웠는지 모른다(갈아 껴도 안 바뀐다).
 *
 * 📌 M0 부채(명세 「페이블 설계 검증 반영」 6): 인터페이스 파일은 **타입만**(값 0 — 구조 검사 ⑱ 「src/plugins 가
 *    src/interfaces 를 값 import 0건」과 모순 안 나게). 그래서 여기선 NodesApi 타입을 **재export** 만 한다.
 *    실체(makeNodesApi)는 제공자 플러그인 안에 산다. 이름·버전(문자열 '0.1.0')은 src/app 의 인터페이스 목록이 쥔다.
 *   ⚠️ 지금은 제공자 플러그인의 타입을 그대로 재export 한다(바닥 단계라 아직 독립 타입으로 안 뺐다) — 소비자는
 *      이 경로('../interfaces/nodes')로만 import type 한다. 제공자가 서버로 바뀌어도 이 타입 자리는 그대로다.
 */
export type { NodesApi, PublicNode, NodeTypeImplFns } from '../plugins/project-explorer/api';
