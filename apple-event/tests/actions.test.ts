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

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
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
    // dispatcher must reject BEFORE any temp file is written (password safety)
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("unlinks the temp script even when osascript throws (password file cleanup)", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("osascript exploded");
    });
    const pub: Publication = {
      id: "pressreader", title: "PressReader", subtitle: "x",
      type: "service", handler: "pressreader",
    };
    await expect(openPublication(pub)).rejects.toBeInstanceOf(ScriptExecutionError);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    expect(unlinkSync).toHaveBeenCalledTimes(1);
  });
});
