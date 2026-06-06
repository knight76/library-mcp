# library MCP 서버 전환 — 구현 plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code에서 국립중앙도서관 자동 로그인 후 PressReader / O'Reilly / 14개 신문·잡지를 자연어로 열 수 있는 MCP 서버를 **신규 디렉토리** `/Users/samuel.kim/dev/my/library-mcp`에 처음부터 구현한다. 기존 Raycast 확장(`/Users/samuel.kim/dev/my/library`)은 건드리지 않는다.

**Architecture:** `osascript`로 Chrome을 조작하는 AppleScript 로직은 기존 `library/src/actions.ts`의 코드를 참조해 새로 작성. 데이터(`publications.ts`)와 행위(`actions.ts`)를 분리. MCP 서버(`server.ts`)는 `open_publication`/`list_publications` 2개 tool만 노출.

**Tech Stack:** Node.js, TypeScript (ESM, NodeNext), `@modelcontextprotocol/sdk`, Vitest, tsx, AppleScript via `child_process.execSync("osascript ...")`.

**Spec:** `docs/superpowers/specs/2026-06-07-library-mcp-design.md`

**작업 시 주의**
- 작업 디렉토리는 항상 `/Users/samuel.kim/dev/my/library-mcp` (이미 `git init` 됨, `main` 브랜치).
- 기존 `/Users/samuel.kim/dev/my/library` 디렉토리는 **읽기 전용**으로만 참조. 절대 수정하지 않는다.
- credentials는 `~/dev/my/library/credentials.json`을 그대로 공유 (config.ts 안의 경로 그대로 둠).
- 이 plan의 코드 블록은 자체완결적이다 — 외부 참조 없이 그대로 작성해도 동작하도록 작성됨.

---

## Task 1: 프로젝트 툴링 셋업 (fresh start)

**Files (모두 신규 생성):**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/config.ts`

`/Users/samuel.kim/dev/my/library-mcp/`는 이미 빈 git repo (main 브랜치). `docs/superpowers/{specs,plans}/`만 들어 있고 src/tests는 비어 있음.

- [ ] **Step 1: .gitignore 작성**

`.gitignore` 전체 내용:

```
node_modules/
dist/
.DS_Store
*.log
```

- [ ] **Step 2: package.json 작성**

`package.json` 전체 내용:

```json
{
  "name": "nl-library-mcp",
  "version": "0.1.0",
  "description": "국립중앙도서관 자동 로그인 → PressReader 등 14개 매체 접속 MCP 서버",
  "type": "module",
  "bin": {
    "library-mcp": "dist/server.js"
  },
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

- [ ] **Step 3: tsconfig.json 작성**

`tsconfig.json` 전체 내용:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "declaration": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`include`는 `src/**/*`만, `exclude`에 `tests` 포함 — tests는 Vitest가 자체적으로 ts-처리.

- [ ] **Step 4: src/config.ts 작성**

`src/config.ts` 전체 내용:

```ts
import { join } from "node:path";
import { homedir } from "node:os";

// 기존 Raycast 확장과 credentials.json을 공유한다 — 경로는 ~/dev/my/library/credentials.json
export const CREDENTIALS_PATH = join(homedir(), "dev/my/library/credentials.json");

// Delay 설정 (초 단위)
export const DELAY = {
  SHORT: 0.5,
  MEDIUM: 1,
  LONG: 2,
};

// 국립중앙도서관 URL
export const NL_LOGIN_URL = "https://www.nl.go.kr/NL/contents/N60100000000.do";
export const NL_NEWS_URL = "https://www.nl.go.kr/NL/contents/N10401000000.do?schOpt1=nwsmgz";
```

- [ ] **Step 5: npm install**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npm install
```

Expected: `node_modules/`, `package-lock.json` 생성, 1개 dep + 4개 devDep 설치 성공.

- [ ] **Step 6: 설치 검증**

```bash
ls node_modules/@modelcontextprotocol/sdk/package.json node_modules/vitest/package.json node_modules/tsx/package.json
```

Expected: 세 파일 모두 존재.

- [ ] **Step 7: 첫 Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add .gitignore package.json package-lock.json tsconfig.json src/config.ts
git commit -m "chore: MCP 서버 프로젝트 초기 셋업"
```

(`docs/`는 이전에 별도로 add+commit됨. `node_modules/`, `dist/`는 .gitignore.)

---

## Task 2: AppleScript 빌더 분리 (`src/applescript.ts`)

**Files:**
- Create: `src/applescript.ts`
- Create: `tests/applescript.test.ts`
- Reference (do not modify): `/Users/samuel.kim/dev/my/library/src/actions.ts` (별도 디렉토리, 읽기 전용 — 기존 Raycast 확장의 코드. 이 plan에 코드를 다 박았으니 실제로 열어볼 필요는 없음.)

**목적:** AppleScript 생성 로직과 실행 로직을 분리. `applescript.ts`는 순수 문자열 생성 (의존성: `src/config.ts`만).

- [ ] **Step 1: src/applescript.ts 작성**

`src/applescript.ts` 전체 내용:

```ts
import { DELAY, NL_LOGIN_URL, NL_NEWS_URL } from "./config.js";

export interface Credentials {
  username: string;
  password: string;
}

export function escapeForJS(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

export function getLoginScript(creds: Credentials): string {
  const safeUsername = escapeForJS(creds.username);
  const safePassword = escapeForJS(creds.password);

  return `
tell application "Google Chrome"
  activate
  open location "${NL_LOGIN_URL}"
  delay ${DELAY.MEDIUM}

  set activeTab to active tab of front window

  delay ${DELAY.MEDIUM}
end tell

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.SHORT}

tell application "Google Chrome"
  set activeTab to active tab of front window

  set hasLoginForm to execute activeTab javascript "
    const passwordInput = document.querySelector('input[type=\\"password\\"]');
    passwordInput ? 'true' : 'false';
  "

  if hasLoginForm is "true" then
    execute activeTab javascript "
      const userInput = document.getElementById('id');
      if (userInput) {
        userInput.value = '${safeUsername}';
        userInput.dispatchEvent(new Event('input', { bubbles: true }));
        userInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    "

    delay ${DELAY.SHORT}

    execute activeTab javascript "
      const passInput = document.getElementById('pass');
      if (passInput) {
        passInput.value = '${safePassword}';
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    "

    delay ${DELAY.MEDIUM}

    execute activeTab javascript "
      const loginBtn = document.querySelector('a.btn_login');
      if (loginBtn) {
        loginBtn.click();
      }
    "

    delay ${DELAY.MEDIUM}

    tell application "System Events"
      delay ${DELAY.SHORT}
      keystroke return
    end tell

    delay ${DELAY.MEDIUM}

    set currentUrl to execute activeTab javascript "window.location.href"

    if currentUrl contains "N60100000000" then
      return "LOGIN_FAILED"
    end if
  end if
end tell
`;
}

export function getNavigateToPressReaderScript(creds: Credentials): string {
  return getLoginScript(creds) + `

tell application "Google Chrome"
  set activeTab to active tab of front window
  execute activeTab javascript "window.location.href = '${NL_NEWS_URL}';"

  delay ${DELAY.MEDIUM}
  delay ${DELAY.MEDIUM}

  execute activeTab javascript "
    window.confirm = function() { return true; };

    const rows = document.querySelectorAll('table tbody tr');
    for (const row of rows) {
      const text = row.textContent || '';
      if (text.includes('PressReader')) {
        const link = row.querySelector('a[onclick*=\\"db_login\\"]') ||
                     row.querySelector('a[href=\\"#dummy\\"]') ||
                     Array.from(row.querySelectorAll('a')).find(a => a.textContent?.trim() === '가능');
        if (link) {
          link.click();
        }
        break;
      }
    }
  "

  delay ${DELAY.SHORT}

end tell

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.LONG}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    const closeBtn = document.querySelector('.modal-close') ||
                     document.querySelector('.popup-close') ||
                     document.querySelector('[class*=\\"close\\"]') ||
                     document.querySelector('button[aria-label*=\\"close\\"]') ||
                     document.querySelector('button[aria-label*=\\"Close\\"]') ||
                     document.querySelector('.modal button') ||
                     document.querySelector('[class*=\\"modal\\"] button');
    if (closeBtn) closeBtn.click();

    const overlay = document.querySelector('.modal-overlay') ||
                    document.querySelector('.popup-overlay') ||
                    document.querySelector('[class*=\\"overlay\\"]');
    if (overlay) overlay.remove();

    const modal = document.querySelector('.modal') ||
                  document.querySelector('[class*=\\"modal\\"]') ||
                  document.querySelector('[role=\\"dialog\\"]');
    if (modal) modal.remove();
  "
end tell

delay ${DELAY.MEDIUM}
`;
}
```

**핵심 변경점 vs 기존 `actions.ts`**: `getLoginScript` / `getNavigateToPressReaderScript`가 **인자로 `Credentials`를 받음** (전에는 함수 내부에서 `loadCredentials()` 호출). 이렇게 분리해야 (1) 단위 테스트 가능, (2) credentials 로딩 책임은 `actions.ts`로 분리됨.

- [ ] **Step 2: tests/applescript.test.ts 작성**

`tests/applescript.test.ts` 전체 내용:

```ts
import { describe, it, expect } from "vitest";
import { escapeForJS, getLoginScript, getNavigateToPressReaderScript } from "../src/applescript.js";

describe("escapeForJS", () => {
  it("escapes backslashes, single quotes, and double quotes", () => {
    expect(escapeForJS(`a\\b`)).toBe(`a\\\\b`);
    expect(escapeForJS(`it's`)).toBe(`it\\'s`);
    expect(escapeForJS(`"hi"`)).toBe(`\\"hi\\"`);
  });
});

describe("getLoginScript", () => {
  const creds = { username: "alice", password: "p@ss" };

  it("includes the login URL", () => {
    const script = getLoginScript(creds);
    expect(script).toContain("https://www.nl.go.kr/NL/contents/N60100000000.do");
  });

  it("injects username and password into the script", () => {
    const script = getLoginScript(creds);
    expect(script).toContain("'alice'");
    expect(script).toContain("'p@ss'");
  });

  it("escapes credentials with quotes", () => {
    const script = getLoginScript({ username: "bob's", password: `"x"` });
    expect(script).toContain(`'bob\\'s'`);
    expect(script).toContain(`'\\"x\\"'`);
  });

  it("returns LOGIN_FAILED guard when still on login page", () => {
    const script = getLoginScript(creds);
    expect(script).toContain(`return "LOGIN_FAILED"`);
  });
});

describe("getNavigateToPressReaderScript", () => {
  const creds = { username: "alice", password: "p@ss" };

  it("includes the news URL", () => {
    const script = getNavigateToPressReaderScript(creds);
    expect(script).toContain("schOpt1=nwsmgz");
  });

  it("contains the full login script", () => {
    const loginScript = getLoginScript(creds);
    const navScript = getNavigateToPressReaderScript(creds);
    expect(navScript.startsWith(loginScript)).toBe(true);
  });

  it("clicks the PressReader row", () => {
    const script = getNavigateToPressReaderScript(creds);
    expect(script).toContain("PressReader");
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/applescript.test.ts
```

Expected: 7 passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add src/applescript.ts tests/applescript.test.ts
git commit -m "feat: AppleScript 빌더 (getLoginScript / getNavigateToPressReaderScript) 추가"
```

---

## Task 3: `publications.ts` 데이터 모델

**Files:**
- Create: `src/publications.ts` (이 task에선 데이터 + 타입만, `findPublication`은 Task 4에서)
- Create: `tests/publications.data.test.ts`

- [ ] **Step 1: src/publications.ts 데이터 작성**

`src/publications.ts` 전체 내용 (이 task 끝까지):

```ts
export type PublicationType = "service" | "newspaper" | "magazine";
export type Handler = "pressreader" | "newspaper" | "oreilly";

export interface Publication {
  id: string;
  title: string;
  subtitle: string;
  type: PublicationType;
  handler: Handler;
  urlPath?: string;
}

export const publications: Publication[] = [
  { id: "pressreader",     title: "PressReader",         subtitle: "전세계 신문/잡지 메인",          type: "service",   handler: "pressreader" },
  { id: "oreilly",         title: "O'Reilly",            subtitle: "O'Reilly for Public Libraries",  type: "service",   handler: "oreilly" },
  { id: "wsj",             title: "월스트리트저널",       subtitle: "The Wall Street Journal",        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-wall-street-journal" },
  { id: "economist",       title: "The Economist",       subtitle: "The Economist (Asia Pacific)",   type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/the-economist-asia-pacific" },
  { id: "hankyoreh",       title: "한겨레 신문",          subtitle: "한겨레",                          type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/hankyoreh" },
  { id: "kyunghyang",      title: "경향신문",             subtitle: "경향신문",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/kyunghyang" },
  { id: "maeil",           title: "매일경제",             subtitle: "Maeil Business Newspaper",       type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/maeil-business-newspaper" },
  { id: "donga",           title: "동아일보",             subtitle: "동아일보",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/dong-a-ilbo" },
  { id: "joongang",        title: "중앙일보",             subtitle: "중앙일보",                        type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/joongang-ilbo" },
  { id: "cine21",          title: "씨네21",               subtitle: "씨네21",                          type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/cine21" },
  { id: "washington-post", title: "Washington Post",     subtitle: "The Washington Post",            type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/the-washington-post" },
  { id: "level",           title: "Level",               subtitle: "Level (Game Magazine)",          type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/level" },
  { id: "wired",           title: "Wired",               subtitle: "Wired Magazine",                 type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/wired" },
  { id: "opensource",      title: "Open Source For You", subtitle: "Open Source Magazine",           type: "magazine",  handler: "newspaper", urlPath: "/ko/magazines/m/open-source-for-you" },
];

export type FindResult =
  | { kind: "found"; publication: Publication }
  | { kind: "ambiguous"; matches: Publication[] }
  | { kind: "not-found" };

// findPublication is implemented in Task 4
```

- [ ] **Step 2: tests/publications.data.test.ts 작성**

`tests/publications.data.test.ts` 전체 내용:

```ts
import { describe, it, expect } from "vitest";
import { publications, type Publication } from "../src/publications.js";

describe("publications data", () => {
  it("has exactly 14 entries", () => {
    expect(publications).toHaveLength(14);
  });

  it("has unique ids", () => {
    const ids = publications.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires urlPath for newspaper handler", () => {
    for (const p of publications) {
      if (p.handler === "newspaper") {
        expect(p.urlPath, `${p.id} should have urlPath`).toBeDefined();
        expect(p.urlPath!.startsWith("/"), `${p.id} urlPath should be absolute path`).toBe(true);
      }
    }
  });

  it("does not require urlPath for service handler", () => {
    for (const p of publications) {
      if (p.handler === "pressreader" || p.handler === "oreilly") {
        expect(p.urlPath, `${p.id} should not have urlPath`).toBeUndefined();
      }
    }
  });

  it("contains expected key publications", () => {
    const byId = (id: string): Publication | undefined => publications.find(p => p.id === id);
    expect(byId("pressreader")?.handler).toBe("pressreader");
    expect(byId("oreilly")?.handler).toBe("oreilly");
    expect(byId("hankyoreh")?.title).toBe("한겨레 신문");
    expect(byId("wsj")?.urlPath).toBe("/ko/newspapers/n/the-wall-street-journal");
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/publications.data.test.ts
```

Expected: 5 passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add src/publications.ts tests/publications.data.test.ts
git commit -m "feat: publications 데이터 모델 추가 (14개 매체)"
```

---

## Task 4: `findPublication()` — TDD

**Files:**
- Modify: `src/publications.ts` (Task 3에서 만든 파일에 `normalize` + `findPublication` 추가)
- Create: `tests/findPublication.test.ts`

- [ ] **Step 1: tests/findPublication.test.ts (실패 테스트) 작성**

`tests/findPublication.test.ts` 전체 내용:

```ts
import { describe, it, expect } from "vitest";
import { findPublication } from "../src/publications.js";

describe("findPublication — exact match", () => {
  it("matches by id", () => {
    const r = findPublication("hankyoreh");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("hankyoreh");
  });

  it("matches by title (Korean)", () => {
    const r = findPublication("한겨레 신문");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("hankyoreh");
  });

  it("matches by subtitle (Korean shortened)", () => {
    const r = findPublication("한겨레");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("hankyoreh");
  });
});

describe("findPublication — normalization", () => {
  it("is case-insensitive", () => {
    const r = findPublication("Hankyoreh");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("hankyoreh");
  });

  it("strips spaces, hyphens, underscores", () => {
    expect(findPublication("washington-post").kind).toBe("found");
    expect(findPublication("washington post").kind).toBe("found");
    expect(findPublication("WashingtonPost").kind).toBe("found");
    expect(findPublication("washington_post").kind).toBe("found");
  });

  it("strips apostrophes", () => {
    expect(findPublication("O'Reilly").kind).toBe("found");
    expect(findPublication("oreilly").kind).toBe("found");
    expect(findPublication("OReilly").kind).toBe("found");
  });
});

describe("findPublication — substring single match", () => {
  it('"press" matches pressreader (substring of id)', () => {
    const r = findPublication("press");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("pressreader");
  });

  it('"wire" matches wired (substring of id)', () => {
    const r = findPublication("wire");
    expect(r.kind).toBe("found");
    if (r.kind === "found") expect(r.publication.id).toBe("wired");
  });
});

describe("findPublication — ambiguous", () => {
  it('"신문" is ambiguous (matches multiple Korean newspapers)', () => {
    const r = findPublication("신문");
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.matches.map(p => p.id);
      expect(ids).toContain("hankyoreh");
      expect(ids).toContain("kyunghyang");
      expect(ids.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("findPublication — not found", () => {
  it("returns not-found for unknown name", () => {
    expect(findPublication("없는신문").kind).toBe("not-found");
  });

  it("returns not-found for empty string", () => {
    expect(findPublication("").kind).toBe("not-found");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는 것 확인**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/findPublication.test.ts
```

Expected: 모두 fail, 사유 `findPublication is not a function` 또는 import 오류.

- [ ] **Step 3: src/publications.ts에 `normalize` + `findPublication` 추가**

`src/publications.ts` 파일 끝(`// findPublication is implemented in Task 4` 주석 자리)에 다음 추가:

```ts
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_'\-]/g, "");
}

export function findPublication(name: string): FindResult {
  const needle = normalize(name);
  if (needle === "") return { kind: "not-found" };

  const haystacks = publications.map(p => ({
    publication: p,
    keys: [normalize(p.id), normalize(p.title), normalize(p.subtitle)],
  }));

  const exact = haystacks.filter(h => h.keys.includes(needle));
  if (exact.length === 1) return { kind: "found", publication: exact[0].publication };
  if (exact.length > 1) {
    return { kind: "ambiguous", matches: exact.map(h => h.publication) };
  }

  const substr = haystacks.filter(h => h.keys.some(k => k.includes(needle)));
  if (substr.length === 1) return { kind: "found", publication: substr[0].publication };
  if (substr.length > 1) {
    return { kind: "ambiguous", matches: substr.map(h => h.publication) };
  }

  return { kind: "not-found" };
}
```

`// findPublication is implemented in Task 4` 주석은 제거.

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/findPublication.test.ts
```

Expected: 모든 테스트 pass.

- [ ] **Step 5: 전체 테스트도 통과 확인**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npm test
```

Expected: 3개 파일(applescript, publications.data, findPublication) 전부 pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add src/publications.ts tests/findPublication.test.ts
git commit -m "feat: findPublication 매칭 정책 (정확/부분/모호) 구현"
```

---

## Task 5: `actions.ts` 신규 작성 — dispatcher + 3개 handler

**Files:**
- Create: `src/actions.ts`
- Create: `tests/actions.test.ts`

**전략:** 기존 `library/src/actions.ts`의 `runPressReaderAction` / `openNewspaper` / `openOreillyEbook` 구조를 따르되:
1. Raycast import 없음 (`showHUD`/`popToRoot` 미사용)
2. AppleScript 빌더는 `./applescript.js`에서 import
3. 각 함수는 `Promise<string>` 반환 (HUD 메시지를 결과 문자열로)
4. credentials 로딩 책임은 `loadCredentials()` 함수로 분리
5. 에러는 throw — 위에서 errorResponse로 변환
6. `openPublication(pub)` 단일 dispatcher 추가

- [ ] **Step 1: src/actions.ts 작성**

`src/actions.ts` 전체 내용:

```ts
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CREDENTIALS_PATH, DELAY } from "./config.js";
import { getLoginScript, getNavigateToPressReaderScript, type Credentials } from "./applescript.js";
import type { Publication } from "./publications.js";

interface StoredCredentials {
  username: string;
  password: string;
}

export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialsError";
  }
}

export class LoginFailedError extends Error {
  constructor() {
    super("로그인 실패: credentials.json의 username/password 확인 필요");
    this.name = "LoginFailedError";
  }
}

export class ScriptExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptExecutionError";
  }
}

export function loadCredentials(): Credentials {
  let raw: string;
  try {
    raw = readFileSync(CREDENTIALS_PATH, "utf-8");
  } catch (e) {
    throw new CredentialsError(
      `자격증명을 읽을 수 없습니다: ${(e as Error).message}. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  let stored: StoredCredentials;
  try {
    stored = JSON.parse(raw) as StoredCredentials;
  } catch (e) {
    throw new CredentialsError(
      `자격증명 JSON 파싱 실패: ${(e as Error).message}. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  if (typeof stored.username !== "string" || typeof stored.password !== "string") {
    throw new CredentialsError(
      `자격증명 형식 오류: username/password 필드 필요. ${CREDENTIALS_PATH} 확인 필요`,
    );
  }

  return {
    username: Buffer.from(stored.username, "base64").toString("utf-8"),
    password: Buffer.from(stored.password, "base64").toString("utf-8"),
  };
}

function runOsascript(script: string): string {
  const scriptPath = join(tmpdir(), `nl-library-${process.pid}-${Date.now()}.scpt`);
  let written = false;
  try {
    writeFileSync(scriptPath, script);
    written = true;
    const output = execSync(`osascript "${scriptPath}"`, { encoding: "utf-8" }).trim();
    if (output === "LOGIN_FAILED") throw new LoginFailedError();
    return output;
  } catch (e) {
    if (e instanceof LoginFailedError) throw e;
    const err = e as Error & { stderr?: Buffer };
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new ScriptExecutionError(`스크립트 실행 실패: ${stderr}`);
  } finally {
    if (written && existsSync(scriptPath)) {
      try { unlinkSync(scriptPath); } catch { /* ignore cleanup failures */ }
    }
  }
}

async function runPressReaderAction(additionalScript: string, successMessage: string): Promise<string> {
  const creds = loadCredentials();
  const baseScript = getNavigateToPressReaderScript(creds);
  const fullScript = baseScript + "\n" + additionalScript;
  runOsascript(fullScript);
  return successMessage;
}

async function openNewspaper(urlPath: string, successMessage: string): Promise<string> {
  const fullUrl = `https://pressreader.nl.go.kr${urlPath}`;
  const additionalScript = `
delay ${DELAY.MEDIUM}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "window.location.href = '${fullUrl}';"
end tell

delay ${DELAY.MEDIUM}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    const alertClose = document.querySelector('a.alert-close');
    if (alertClose) alertClose.click();
  "
end tell

delay ${DELAY.MEDIUM}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    const noBtn = Array.from(document.querySelectorAll('button, a')).find(el =>
      el.textContent && (
        el.textContent.includes('아니요') ||
        el.textContent.includes('아니오') ||
        el.textContent.toLowerCase() === 'no'
      )
    );
    if (noBtn) noBtn.click();
  "
end tell

delay ${DELAY.MEDIUM}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    const readBtn = document.querySelector('a[href*=\\"read\\"]') ||
                    Array.from(document.querySelectorAll('button, a')).find(el =>
                      el.textContent && el.textContent.includes('지금 읽기')
                    );
    if (readBtn) readBtn.click();
  "
end tell

`;
  return runPressReaderAction(additionalScript, successMessage);
}

async function openOreillyEbook(): Promise<string> {
  const creds = loadCredentials();
  const oreillyPageUrl = "https://www.nl.go.kr/NL/contents/N10401000000.do?page=3&schOpt3=it";

  const script = getLoginScript(creds) + `

tell application "Google Chrome"
  set activeTab to active tab of front window
  execute activeTab javascript "window.location.href = '${oreillyPageUrl}';"
end tell

delay ${DELAY.LONG}

tell application "Google Chrome"
  set activeTab to active tab of front window

  execute activeTab javascript "
    var links = document.querySelectorAll('a.external_use_btn');
    for (var i = 0; i < links.length; i++) {
      var row = links[i].closest('tr');
      if (row && row.textContent.indexOf('Reilly') !== -1) {
        links[i].click();
        break;
      }
    }
  "
end tell

delay ${DELAY.SHORT}

tell application "System Events"
  delay ${DELAY.SHORT}
  keystroke return
end tell

delay ${DELAY.LONG}
delay ${DELAY.LONG}

`;

  runOsascript(script);
  return "O'Reilly 접속 완료";
}

export async function openPublication(pub: Publication): Promise<string> {
  switch (pub.handler) {
    case "pressreader":
      return runPressReaderAction("", "PressReader 접속 완료");
    case "newspaper":
      if (!pub.urlPath) throw new Error(`Publication ${pub.id} has handler=newspaper but no urlPath`);
      return openNewspaper(pub.urlPath, `${pub.title} 열기 완료`);
    case "oreilly":
      return openOreillyEbook();
  }
}
```

- [ ] **Step 2: tests/actions.test.ts 작성**

`tests/actions.test.ts` 전체 내용:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    unlinkSync: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  loadCredentials,
  openPublication,
  CredentialsError,
  LoginFailedError,
  ScriptExecutionError,
} from "../src/actions.js";
import type { Publication } from "../src/publications.js";

const validCredsFile = JSON.stringify({
  username: Buffer.from("alice").toString("base64"),
  password: Buffer.from("p@ss").toString("base64"),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadCredentials", () => {
  it("decodes base64 username/password", () => {
    vi.mocked(readFileSync).mockReturnValue(validCredsFile);
    const c = loadCredentials();
    expect(c.username).toBe("alice");
    expect(c.password).toBe("p@ss");
  });

  it("throws CredentialsError when file is missing", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    expect(() => loadCredentials()).toThrow(CredentialsError);
  });

  it("throws CredentialsError on invalid JSON", () => {
    vi.mocked(readFileSync).mockReturnValue("not json");
    expect(() => loadCredentials()).toThrow(CredentialsError);
  });

  it("throws CredentialsError when required fields are missing", () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ foo: "bar" }));
    expect(() => loadCredentials()).toThrow(CredentialsError);
  });
});

describe("openPublication dispatcher", () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReturnValue(validCredsFile);
    // execSync is called with { encoding: "utf-8" } so it returns string
    vi.mocked(execSync).mockReturnValue("" as unknown as Buffer);
  });

  it("returns PressReader 접속 완료 for pressreader handler", async () => {
    const pub: Publication = {
      id: "pressreader", title: "PressReader", subtitle: "x",
      type: "service", handler: "pressreader",
    };
    const msg = await openPublication(pub);
    expect(msg).toBe("PressReader 접속 완료");
  });

  it("returns <title> 열기 완료 for newspaper handler", async () => {
    const pub: Publication = {
      id: "hankyoreh", title: "한겨레 신문", subtitle: "한겨레",
      type: "newspaper", handler: "newspaper", urlPath: "/ko/newspapers/n/hankyoreh",
    };
    const msg = await openPublication(pub);
    expect(msg).toBe("한겨레 신문 열기 완료");
  });

  it("returns O'Reilly 접속 완료 for oreilly handler", async () => {
    const pub: Publication = {
      id: "oreilly", title: "O'Reilly", subtitle: "x",
      type: "service", handler: "oreilly",
    };
    const msg = await openPublication(pub);
    expect(msg).toBe("O'Reilly 접속 완료");
  });

  it("writes a temp script and calls osascript", async () => {
    const pub: Publication = {
      id: "pressreader", title: "PressReader", subtitle: "x",
      type: "service", handler: "pressreader",
    };
    await openPublication(pub);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(execSync).toHaveBeenCalledTimes(1);
    const [cmd] = vi.mocked(execSync).mock.calls[0];
    expect(String(cmd)).toMatch(/^osascript ".+\.scpt"$/);
  });

  it("throws LoginFailedError when osascript outputs LOGIN_FAILED", async () => {
    vi.mocked(execSync).mockReturnValue("LOGIN_FAILED" as unknown as Buffer);
    const pub: Publication = {
      id: "pressreader", title: "PressReader", subtitle: "x",
      type: "service", handler: "pressreader",
    };
    await expect(openPublication(pub)).rejects.toBeInstanceOf(LoginFailedError);
  });

  it("throws ScriptExecutionError when osascript fails", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error("Command failed") as Error & { stderr?: Buffer };
      err.stderr = Buffer.from("Chrome is not running");
      throw err;
    });
    const pub: Publication = {
      id: "pressreader", title: "PressReader", subtitle: "x",
      type: "service", handler: "pressreader",
    };
    await expect(openPublication(pub)).rejects.toBeInstanceOf(ScriptExecutionError);
  });

  it("throws when newspaper handler has no urlPath", async () => {
    const pub: Publication = {
      id: "wsj", title: "WSJ", subtitle: "x",
      type: "newspaper", handler: "newspaper", // urlPath missing on purpose
    };
    await expect(openPublication(pub)).rejects.toThrow(/no urlPath/);
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/actions.test.ts
```

Expected: 11개 통과.

- [ ] **Step 4: 전체 테스트 + 타입체크**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npm test
npx tsc --noEmit
```

Expected: 4개 테스트 파일 전부 pass, tsc 오류 없음.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add src/actions.ts tests/actions.test.ts
git commit -m "feat: actions.ts (dispatcher + 3종 handler + 에러 클래스) 추가"
```

---

## Task 6: MCP 서버 (`src/server.ts`)

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: src/server.ts 작성**

`src/server.ts` 전체 내용:

```ts
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { publications, findPublication } from "./publications.js";
import {
  openPublication,
  CredentialsError,
  LoginFailedError,
  ScriptExecutionError,
} from "./actions.js";

const PUBLICATION_LIST_FOR_DESCRIPTION = publications
  .map(p => `    ${p.id.padEnd(15)} | ${p.title}`)
  .join("\n");

export const TOOLS: Tool[] = [
  {
    name: "open_publication",
    description:
      `국립중앙도서관 자동 로그인 후 지정한 매체를 Chrome에서 엽니다.\n` +
      `사용 가능한 매체 (id | 한글명):\n` +
      PUBLICATION_LIST_FOR_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: '매체 id 또는 한글명 (예: "hankyoreh", "한겨레 신문")',
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_publications",
    description: "사용 가능한 매체 목록을 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

let lock: Promise<unknown> = Promise.resolve();
export async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  const next = new Promise<void>(r => { release = r; });
  lock = next;
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
  }
}

const ALL_IDS = publications.map(p => p.id).join(", ");

export async function handleCallTool(req: CallToolRequest): Promise<CallToolResult> {
  const toolName = req.params.name;

  if (toolName === "list_publications") {
    const summary = publications.map(({ id, title, subtitle, type }) => ({ id, title, subtitle, type }));
    return textResult(JSON.stringify(summary, null, 2));
  }

  if (toolName === "open_publication") {
    const args = req.params.arguments as { name?: unknown } | undefined;
    const name = typeof args?.name === "string" ? args.name : "";

    if (name === "") {
      return errorResult(`'name' 인자가 필요합니다. 사용 가능한 id: ${ALL_IDS}`);
    }

    const result = findPublication(name);
    if (result.kind === "not-found") {
      return errorResult(`매체를 찾을 수 없습니다: "${name}". 사용 가능한 id: ${ALL_IDS}`);
    }
    if (result.kind === "ambiguous") {
      const matchIds = result.matches.map(p => p.id).join(", ");
      return errorResult(
        `매체 이름이 모호합니다: "${name}"이 여러 매체와 일치 (${matchIds}). 정확한 id 또는 한글명을 사용해 주세요.`,
      );
    }

    try {
      const msg = await serialized(() => openPublication(result.publication));
      return textResult(msg);
    } catch (e) {
      if (e instanceof CredentialsError) return errorResult(e.message);
      if (e instanceof LoginFailedError) return errorResult(e.message);
      if (e instanceof ScriptExecutionError) return errorResult(e.message);
      return errorResult(`예상치 못한 오류: ${(e as Error).message}`);
    }
  }

  return errorResult(`알 수 없는 tool: ${toolName}`);
}

async function main(): Promise<void> {
  const server = new Server(
    { name: "library", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, handleCallTool);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/server.js") ||
  process.argv[1]?.endsWith("/server.ts");

if (isDirectRun) {
  main().catch(err => {
    console.error("library MCP server failed:", err);
    process.exit(1);
  });
}
```

핵심:
- `TOOLS`, `handleCallTool`, `serialized` 모두 **export** → 테스트에서 직접 호출 가능
- `isDirectRun` 가드: 테스트에서 import할 때 자동 `main()` 호출 안 됨

- [ ] **Step 2: tests/server.test.ts 작성**

`tests/server.test.ts` 전체 내용:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/actions.js", async () => {
  const actual = await vi.importActual<typeof import("../src/actions.js")>("../src/actions.js");
  return {
    ...actual,
    openPublication: vi.fn(),
  };
});

import { TOOLS, handleCallTool, serialized } from "../src/server.js";
import {
  openPublication,
  CredentialsError,
  LoginFailedError,
  ScriptExecutionError,
} from "../src/actions.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

function callRequest(name: string, args?: Record<string, unknown>): CallToolRequest {
  return {
    method: "tools/call",
    params: { name, arguments: args },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TOOLS", () => {
  it("exposes exactly two tools", () => {
    expect(TOOLS).toHaveLength(2);
    const names = TOOLS.map(t => t.name);
    expect(names).toContain("open_publication");
    expect(names).toContain("list_publications");
  });

  it("open_publication description lists all 14 publication ids", () => {
    const openTool = TOOLS.find(t => t.name === "open_publication")!;
    const ids = ["pressreader", "oreilly", "wsj", "economist", "hankyoreh", "kyunghyang",
                 "maeil", "donga", "joongang", "cine21", "washington-post", "level",
                 "wired", "opensource"];
    for (const id of ids) {
      expect(openTool.description, `description should mention ${id}`).toContain(id);
    }
  });
});

describe("handleCallTool — list_publications", () => {
  it("returns JSON array with 14 entries", async () => {
    const res = await handleCallTool(callRequest("list_publications"));
    expect(res.isError).toBeFalsy();
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(14);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("title");
  });
});

describe("handleCallTool — open_publication", () => {
  it("returns success message on happy path", async () => {
    vi.mocked(openPublication).mockResolvedValue("한겨레 신문 열기 완료");
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as { text: string }).text).toBe("한겨레 신문 열기 완료");
  });

  it("returns not-found error for unknown publication", async () => {
    const res = await handleCallTool(callRequest("open_publication", { name: "없는신문" }));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("찾을 수 없습니다");
    expect(openPublication).not.toHaveBeenCalled();
  });

  it("returns ambiguous error for ambiguous name", async () => {
    const res = await handleCallTool(callRequest("open_publication", { name: "신문" }));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("모호");
    expect(openPublication).not.toHaveBeenCalled();
  });

  it("returns error when name is missing", async () => {
    const res = await handleCallTool(callRequest("open_publication"));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("'name'");
  });

  it("returns CredentialsError message verbatim", async () => {
    vi.mocked(openPublication).mockRejectedValue(new CredentialsError("자격증명을 읽을 수 없습니다: ENOENT. ... 확인 필요"));
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("자격증명을 읽을 수 없습니다");
  });

  it("returns LoginFailedError message", async () => {
    vi.mocked(openPublication).mockRejectedValue(new LoginFailedError());
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("로그인 실패");
  });

  it("returns ScriptExecutionError message", async () => {
    vi.mocked(openPublication).mockRejectedValue(new ScriptExecutionError("스크립트 실행 실패: Chrome not running"));
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("Chrome not running");
  });
});

describe("handleCallTool — unknown tool", () => {
  it("returns error for unknown tool name", async () => {
    const res = await handleCallTool(callRequest("nonexistent_tool"));
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toContain("알 수 없는 tool");
  });
});

describe("serialized mutex", () => {
  it("runs functions sequentially even when called concurrently", async () => {
    const order: string[] = [];
    const slow = (id: string, ms: number) => async () => {
      order.push(`start-${id}`);
      await new Promise(r => setTimeout(r, ms));
      order.push(`end-${id}`);
      return id;
    };

    const [a, b, c] = await Promise.all([
      serialized(slow("a", 30)),
      serialized(slow("b", 10)),
      serialized(slow("c", 10)),
    ]);

    expect([a, b, c]).toEqual(["a", "b", "c"]);
    expect(order).toEqual(["start-a", "end-a", "start-b", "end-b", "start-c", "end-c"]);
  });

  it("releases the lock even when fn throws", async () => {
    await expect(serialized(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const result = await serialized(async () => "after-error");
    expect(result).toBe("after-error");
  });
});
```

- [ ] **Step 3: 테스트 실행**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npx vitest run tests/server.test.ts
```

Expected: 12개 통과.

- [ ] **Step 4: 전체 테스트 + 타입체크**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npm test
npm run typecheck
```

Expected: 5개 테스트 파일 전부 pass (applescript, publications.data, findPublication, actions, server). `tsc --noEmit` 오류 없음.

- [ ] **Step 5: Commit**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git add src/server.ts tests/server.test.ts
git commit -m "feat: MCP 서버 진입점 + handleCallTool + serialized mutex"
```

---

## Task 7: 빌드 & 수동 검증

**Files:**
- Generated: `dist/server.js` (etc.)
- Modify: `~/.claude.json` (mcpServers 섹션)

- [ ] **Step 1: 빌드**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
npm run build
```

Expected: `dist/server.js`, `dist/publications.js`, `dist/actions.js`, `dist/applescript.js`, `dist/config.js` 생성, 오류 없음.

- [ ] **Step 2: shebang 보존 확인 & 실행 권한 부여**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
head -1 dist/server.js
chmod +x dist/server.js
```

Expected: 첫 줄 `#!/usr/bin/env node`. tsc는 shebang을 보존하지만 실행 권한은 안 줌 → `chmod +x` 필요.

- [ ] **Step 3: stdio smoke 테스트**

```bash
cd /Users/samuel.kim/dev/my/library-mcp
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/server.js
```

Expected: 두 개의 JSON-RPC 응답이 출력됨. 두 번째 응답에 `"name":"open_publication"` 과 `"name":"list_publications"` 포함.

이 단계에서 stdout이 비어 있거나 에러가 나면 `node dist/server.js`를 단독 실행해 stderr를 확인.

- [ ] **Step 4: `~/.claude.json`에 library 항목 등록**

`~/.claude.json`의 `mcpServers` 객체에 다음 키를 추가:

```json
"library": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/samuel.kim/dev/my/library-mcp/dist/server.js"],
  "env": {}
}
```

편집 후 JSON 유효성 확인:

```bash
python3 -c "import json; json.load(open('/Users/samuel.kim/.claude.json'))"
```

Expected: 오류 없음 (출력도 없음).

- [ ] **Step 5: Claude Code 재시작**

사용자(보스)에게 안내: Claude Code를 종료 후 재시작하라고 요청. 재시작 후 새 세션에서 `mcp__library__list_publications` 가 자동 노출되는지 확인 필요.

- [ ] **Step 6: 수동 검증 체크리스트 (보스가 직접)**

이 step은 자동화 불가. 보스에게 다음 시나리오를 차례로 시도하라고 안내:

1. Claude Code 새 세션에서 "사용 가능한 매체 목록 보여줘" → `list_publications` 자동 호출, 14개 JSON 반환.
2. "한겨레 열어줘" → Chrome에서 자동 로그인 후 한겨레 PressReader 페이지 열림. tool 응답 = `"한겨레 신문 열기 완료"`.
3. "신문 열어줘" → 모호 에러 메시지. Chrome은 영향 없음.
4. "없는신문 열어줘" → not-found 에러 메시지.
5. `credentials.json`을 임시로 이름 바꿔두기 → 호출 시 자격증명 에러. 원복 후 정상화.
6. "오라일리 열어줘" → O'Reilly 페이지까지 도달.

문제 발생 시: `node dist/server.js < /dev/null` 단독 실행 또는 Claude Code의 MCP 로그에서 stderr 확인.

- [ ] **Step 7: 마무리 commit (필요한 경우)**

`chmod +x dist/server.js`는 파일 권한 변경이므로 git이 추적함. `.gitignore`에 이미 `dist/`가 있어 영향 없음. 검증 중 발견한 수정사항이 있으면 별도 commit:

```bash
cd /Users/samuel.kim/dev/my/library-mcp
git status
# 변경이 있으면
git add <files>
git commit -m "fix: <설명>"
```

검증 통과 시 `~/.claude.json`은 보스 개인 설정이라 commit 대상 아님.

---

## 완료 조건

- [ ] 5개 테스트 파일 모두 통과 (applescript, publications.data, findPublication, actions, server)
- [ ] `npm run typecheck` 오류 없음
- [ ] `npm run build` 성공, `dist/server.js` 생성
- [ ] stdio smoke 테스트로 `tools/list` 응답에 2개 tool 노출 확인
- [ ] `~/.claude.json`에 `library` 항목 등록
- [ ] 보스가 §12 수동 검증 6개 시나리오를 모두 통과
