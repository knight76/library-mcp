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

  it("returns 예상치 못한 오류 for untyped Error fallthrough", async () => {
    vi.mocked(openPublication).mockRejectedValue(new Error("something else"));
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain("예상치 못한 오류");
    expect(text).toContain("something else");
  });

  it("handles non-Error throws without producing 'undefined' message", async () => {
    vi.mocked(openPublication).mockRejectedValue("a raw string");
    const res = await handleCallTool(callRequest("open_publication", { name: "hankyoreh" }));
    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(text).not.toContain("undefined");
    expect(text).toContain("a raw string");
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
