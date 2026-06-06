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
