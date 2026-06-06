# library MCP 서버 설계 — 2026-06-07

## 1. 배경

`/Users/samuel.kim/dev/my/library`는 국립중앙도서관 자동 로그인 후 PressReader / O'Reilly / 14개 매체로 이동하는 Raycast 확장이다. 핵심 로직은 AppleScript(`osascript`)로 Chrome을 조작하는 14개 함수이며, Raycast API는 메뉴 UI(`List`)와 HUD 표시에만 쓰인다.

이번 작업은 **별도 디렉토리 `/Users/samuel.kim/dev/my/library-mcp`에 같은 핵심 로직(AppleScript 자동 로그인 + 매체 이동)을 MCP 서버로 새로 구현**한다. 기존 `library/` Raycast 확장은 그대로 유지되며, 양쪽이 같은 `~/dev/my/library/credentials.json`을 공유한다.

## 2. 목표 / 비목표

**목표**
- Claude Code에서 자연어로 14개 매체를 열 수 있게 한다.
- AppleScript 자동화 로직(로그인 + 네비게이션)은 기존 `library/src/actions.ts`의 코드를 참조해 새 프로젝트에 다시 작성한다.
- 매체 추가 시 데이터 1줄만 늘리면 자동으로 tool description에 반영되도록 한다.
- 기존 Raycast 확장(`library/`)에 영향을 주지 않는다. credentials도 공유.

**비목표**
- `library/` Raycast 코드 수정 — 일절 건드리지 않음.
- 다른 도서관/사이트 일반화 — 국립중앙도서관 전용.
- 임의 URL 자동 로그인 같은 power-user 기능 — YAGNI.
- macOS 외 플랫폼 — Chrome + osascript 의존이라 macOS 전용.

## 3. 디렉토리 구조

```
/Users/samuel.kim/dev/my/library-mcp/   # 신규 디렉토리, 별도 git repo
├── package.json
├── tsconfig.json
├── .gitignore               # node_modules/, dist/
├── src/
│   ├── server.ts            # MCP server, stdio transport
│   ├── publications.ts      # 순수 데이터 (14개 매체) + findPublication
│   ├── actions.ts           # dispatcher + 3종 handler (osascript 실행)
│   ├── applescript.ts       # getLoginScript / getNavigateToPressReaderScript
│   └── config.ts            # CREDENTIALS_PATH (~/dev/my/library/credentials.json), DELAY, URL
├── tests/                   # Vitest 단위 테스트
└── dist/                    # tsc 산출물 (gitignore)
    └── server.js
```

**참고 자료** (read-only):
- `~/dev/my/library/src/actions.ts` — 기존 AppleScript 코드. 새 `applescript.ts` / `actions.ts` 작성 시 출처.
- `~/dev/my/library/src/config.ts` — 기존 URL/DELAY 상수. 새 `config.ts`에 그대로 복제.

**의존성** (신규 추가): `@modelcontextprotocol/sdk` (런타임), `tsx`/`typescript`/`vitest`/`@types/node` (dev). Raycast 의존성 없음.

## 4. Tool Surface

MCP 서버 이름: `library` (등록 시 `~/.claude.json`의 키).

### 4.1 `open_publication`

```
name: open_publication
description: |
  국립중앙도서관 자동 로그인 후 지정한 매체를 Chrome에서 엽니다.
  사용 가능한 매체 (id | 한글명):
    pressreader     | PressReader 메인
    oreilly         | O'Reilly for Public Libraries
    wsj             | 월스트리트저널
    economist       | The Economist
    hankyoreh       | 한겨레 신문
    kyunghyang      | 경향신문
    maeil           | 매일경제
    donga           | 동아일보
    joongang        | 중앙일보
    cine21          | 씨네21
    washington-post | Washington Post
    level           | Level
    wired           | Wired
    opensource      | Open Source For You
inputSchema:
  type: object
  properties:
    name:
      type: string
      description: 매체 id 또는 한글명 (예: "hankyoreh", "한겨레 신문")
  required: [name]
```

### 4.2 `list_publications`

```
name: list_publications
description: 사용 가능한 매체 목록을 반환합니다.
inputSchema: { type: object, properties: {} }
output: [{ id, title, subtitle, type: "newspaper" | "magazine" | "service" }, ...]
```

→ description에 14개가 이미 인라인돼 있어 `list_publications`는 디버깅/확인용. Claude는 첫 호출부터 정확한 id로 매핑 가능.

## 5. 매칭 정책 (`findPublication(name)`)

1. **정규화**: 입력 `name`과 각 publication의 `id`/`title`/`subtitle`에 동일 변환 적용
   - 소문자화
   - 공백·하이픈·언더스코어·아포스트로피(`'`) 제거
2. **정확 매칭**: 정규화된 `name`이 어떤 publication의 정규화된 id/title/subtitle 중 하나와 정확히 같으면 해당 publication 반환
3. **부분문자열 단일 매칭**: 정확 매칭 실패 시, 정규화된 `name`이 정확히 하나의 publication의 id/title/subtitle에 포함되면 그 publication 반환
4. **모호 매칭**: 부분문자열이 2개 이상 publication과 매칭되면 모호 에러
5. **매칭 실패**: 아무 것도 안 맞으면 not-found 에러

예시:
- `"한겨레"` → `hankyoreh` (정확 매칭, subtitle `"한겨레"`와 일치)
- `"한겨레 신문"` → `hankyoreh` (정확 매칭, title과 일치)
- `"Hankyoreh"` → `hankyoreh` (정확 매칭, 정규화 후 id와 일치)
- `"O'Reilly"` / `"oreilly"` / `"OReilly"` → `oreilly` (정확 매칭, 아포스트로피 제거 후)
- `"press"` → `pressreader` (부분문자열 단일 매칭, id `"pressreader"`에 포함)
- `"신문"` → 모호 에러 (한겨레 신문, 경향신문, 동아일보 … 모두 "신문" 포함)
- `"없는신문"` → not-found 에러

## 6. 데이터 모델 (`src/publications.ts`)

```ts
export type PublicationType = "service" | "newspaper" | "magazine";
export type Handler = "pressreader" | "newspaper" | "oreilly";

export interface Publication {
  id: string;            // 영문 슬러그 (매칭 키)
  title: string;         // 한글명 (매칭 키)
  subtitle: string;      // 표시용 (list_publications 응답)
  type: PublicationType;
  handler: Handler;
  urlPath?: string;      // handler === "newspaper"일 때만
}

export const publications: Publication[] = [
  { id: "pressreader",     title: "PressReader",         subtitle: "전세계 신문/잡지 메인",       type: "service",   handler: "pressreader" },
  { id: "oreilly",         title: "O'Reilly",            subtitle: "O'Reilly for Public Libraries", type: "service",   handler: "oreilly" },
  { id: "wsj",             title: "월스트리트저널",       subtitle: "The Wall Street Journal",     type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-wall-street-journal" },
  { id: "economist",       title: "The Economist",       subtitle: "The Economist (Asia Pacific)", type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/the-economist-asia-pacific" },
  { id: "hankyoreh",       title: "한겨레 신문",          subtitle: "한겨레",                       type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/hankyoreh" },
  { id: "kyunghyang",      title: "경향신문",             subtitle: "경향신문",                     type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/kyunghyang" },
  { id: "maeil",           title: "매일경제",             subtitle: "Maeil Business Newspaper",     type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/maeil-business-newspaper" },
  { id: "donga",           title: "동아일보",             subtitle: "동아일보",                     type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/dong-a-ilbo" },
  { id: "joongang",        title: "중앙일보",             subtitle: "중앙일보",                     type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/joongang-ilbo" },
  { id: "cine21",          title: "씨네21",               subtitle: "씨네21",                       type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/cine21" },
  { id: "washington-post", title: "Washington Post",     subtitle: "The Washington Post",          type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-washington-post" },
  { id: "level",           title: "Level",               subtitle: "Level (Game Magazine)",        type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/level" },
  { id: "wired",           title: "Wired",               subtitle: "Wired Magazine",               type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/wired" },
  { id: "opensource",      title: "Open Source For You", subtitle: "Open Source Magazine",         type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/open-source-for-you" },
];

export type FindResult =
  | { kind: "found"; publication: Publication }
  | { kind: "ambiguous"; matches: Publication[] }
  | { kind: "not-found" };

export function findPublication(name: string): FindResult { /* §5 정책 */ }
```

## 7. Dispatcher (`src/actions.ts`)

```ts
export async function openPublication(pub: Publication): Promise<string> {
  switch (pub.handler) {
    case "pressreader": return runPressReaderAction("", "PressReader 접속 완료");
    case "newspaper":   return openNewspaper(pub.urlPath!, `${pub.title} 열기 완료`);
    case "oreilly":     return openOreillyEbook();
  }
}
```

**기존 `actions.ts`에서 변경되는 부분**
- 14개 export 함수(`openWallStreetJournal`, `openHankyoreh`, …) 전부 제거 → 단일 `openPublication` dispatcher로 대체.
- `showHUD`/`popToRoot` 호출 제거.
- `runPressReaderAction` / `openNewspaper` / `openOreillyEbook`은 결과 문자열을 **return**하도록 시그니처 변경 (`Promise<void>` → `Promise<string>`).
- 임시 스크립트 파일 누수 방어: `writeFileSync`를 `try` 안으로 옮기고 `unlinkSync`는 파일이 실제로 생성됐을 때만 호출.
- AppleScript 빌드 함수 `getLoginScript()`, `getNavigateToPressReaderScript()`는 `src/applescript.ts`로 이주.

## 8. 에러 처리 & 응답

모든 응답은 MCP `CallToolResult`로 반환 (텍스트 content 1개).

**성공 응답** (`isError: false`):
- `PressReader 접속 완료`
- `월스트리트저널 열기 완료`
- `O'Reilly 접속 완료`

**실패 응답** (`isError: true`):

| # | 케이스 | 메시지 |
|---|-------|--------|
| 1 | 매칭 실패 (`not-found`) | `매체를 찾을 수 없습니다: "<input>". 사용 가능한 id: pressreader, oreilly, wsj, economist, hankyoreh, kyunghyang, maeil, donga, joongang, cine21, washington-post, level, wired, opensource` |
| 2 | 모호 매칭 (`ambiguous`) | `매체 이름이 모호합니다: "<input>"이 여러 매체와 일치 (<id1>, <id2>, ...). 정확한 id 또는 한글명을 사용해 주세요.` |
| 3 | `credentials.json` 읽기/파싱 실패 | `자격증명을 읽을 수 없습니다: <원본 에러>. ~/dev/my/library/credentials.json 확인 필요` |
| 4 | osascript stdout이 `LOGIN_FAILED` | `로그인 실패: credentials.json의 username/password 확인 필요` |
| 5 | osascript 실행 자체 실패 | `스크립트 실행 실패: <stderr>` |

**원칙**: 기존 `actions.ts:209-213`의 `"오류 발생: 스크립트 실행 실패"` 같은 뭉뚱그리기는 금지. MCP 응답에는 디버깅에 충분한 정보를 노출한다.

## 9. 동시성

`osascript`는 Chrome 활성 윈도우/탭을 가정해 동작하므로, 동시 호출 시 서로 간섭한다.

서버 레벨에서 **단일 mutex**(Promise chain)로 직렬화한다. 두 번째 호출은 첫 번째 완료까지 대기. 별도 큐/타임아웃 없음 (보스 머신 단일 사용자).

```ts
let lock: Promise<unknown> = Promise.resolve();
async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release: () => void;
  lock = new Promise<void>(r => { release = r; });
  await prev.catch(() => {});
  try { return await fn(); } finally { release!(); }
}
```

## 10. MCP 서버 진입점 (`src/server.ts`)

```ts
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { publications, findPublication } from "./publications.js";
import { openPublication } from "./actions.js";

const server = new Server(
  { name: "library", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "open_publication", description: /* §4.1 */, inputSchema: /* §4.1 */ },
    { name: "list_publications", description: /* §4.2 */, inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "list_publications") {
    return { content: [{ type: "text", text: JSON.stringify(publications.map(({ id, title, subtitle, type }) => ({ id, title, subtitle, type })), null, 2) }] };
  }
  if (req.params.name === "open_publication") {
    const name = String((req.params.arguments as { name?: unknown })?.name ?? "");
    const result = findPublication(name);
    if (result.kind === "not-found") return errorResponse(/* §8 #1 */);
    if (result.kind === "ambiguous") return errorResponse(/* §8 #2 */);
    try {
      const msg = await serialized(() => openPublication(result.publication));
      return { content: [{ type: "text", text: msg }] };
    } catch (e) {
      return errorResponse(/* §8 #3/#4/#5 분기 */);
    }
  }
  return errorResponse(`알 수 없는 tool: ${req.params.name}`);
});

await server.connect(new StdioServerTransport());
```

## 11. 패키징 / 등록

**`package.json`**:
```json
{
  "name": "nl-library-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "library-mcp": "dist/server.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.2",
    "vitest": "^1.0.0"
  }
}
```

**`tsconfig.json`**: `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`, `rootDir: src`, `strict: true`, `sourceMap: true`.

**`~/.claude.json` 등록**:
```json
"library": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/samuel.kim/dev/my/library-mcp/dist/server.js"],
  "env": {}
}
```

SEA/`.app` 번들은 안 함 — osascript만 호출하므로 plain `node`로 충분.

## 12. 테스트

**단위 테스트 (Vitest)**:
- `tests/findPublication.test.ts`
  - 정확 매칭: id (`"hankyoreh"`), title (`"한겨레 신문"`), subtitle (`"한겨레"`)
  - 정규화: 대소문자 (`"Hankyoreh"`, `"HANKYOREH"`), 공백/하이픈 (`"washington post"`, `"washington-post"`, `"WashingtonPost"`)
  - 부분문자열 단일 매칭: `"한겨레"` → `hankyoreh`
  - 모호 매칭: `"신문"` → ambiguous (한겨레, 경향, 동아 …)
  - 매칭 실패: `"없는신문"`, `""`
- `tests/dispatch.test.ts`
  - `openPublication`이 handler별 올바른 함수 호출하는지 (actions 모킹)

**통합 테스트는 안 함**: osascript는 Chrome + macOS 의존, CI에서 불가. 보스 머신 수동 검증으로 갈음.

**수동 검증 체크리스트**:
1. `npm install && npm run build` 성공
2. `~/.claude.json`에 `library` 항목 추가 후 Claude Code 재시작
3. Claude Code에서 "사용 가능한 매체 목록" → `list_publications` 호출 → 14개 반환 확인
4. "한겨레 열어줘" → Chrome에서 자동 로그인 후 한겨레 PressReader 페이지 열림
5. "신문 열어줘" → 모호 에러 메시지 노출
6. "없는신문 열어줘" → not-found 에러 메시지 노출
7. `credentials.json`을 임시로 이동 후 호출 → 자격증명 에러 메시지 노출
8. O'Reilly 호출 → O'Reilly 페이지까지 도달

## 13. 마이그레이션 순서

작업 디렉토리: `/Users/samuel.kim/dev/my/library-mcp` (신규, 빈 디렉토리에서 시작).

1. **프로젝트 초기화**: `package.json` 작성, `tsconfig.json` 작성, `.gitignore` 작성 (`node_modules/`, `dist/`), `npm install`
2. **`src/config.ts` 신규**: 기존 `library/src/config.ts` 그대로 복제 (CREDENTIALS_PATH는 `~/dev/my/library/credentials.json` 유지)
3. **`src/applescript.ts` 신규**: `getLoginScript`, `getNavigateToPressReaderScript` — 기존 `library/src/actions.ts`의 AppleScript 코드 재사용. `Credentials`를 인자로 받도록 변경.
4. **`src/publications.ts` 신규**: 데이터 + `findPublication`
5. **`src/actions.ts` 신규**: dispatcher (`openPublication`) + 3종 handler (`runPressReaderAction`, `openNewspaper`, `openOreillyEbook`) + `loadCredentials` + 에러 클래스. 결과 문자열 return.
6. **`src/server.ts` 신규**: MCP 서버 + `handleCallTool` + `serialized` mutex
7. **`tests/` 신규**: Vitest 단위 테스트 (각 모듈)
8. **`npm run build`** → 단위 테스트 + 타입체크 통과 확인
9. **`~/.claude.json` 업데이트**: `library` 항목 등록 후 Claude Code 재시작
10. **수동 검증** (§12) — Claude Code에서 실제 호출

## 14. 열린 질문 / 가정

- **가정**: 보스 머신에는 Chrome이 항상 설치/실행 가능 상태다. (현재 `actions.ts`도 동일 가정)
- **가정**: `~/dev/my/library/credentials.json`의 경로는 변하지 않는다. (필요해지면 환경변수로 빼는 건 후속 작업)
- **결정 보류 없음** — 모든 결정은 §3–§12에서 확정.
