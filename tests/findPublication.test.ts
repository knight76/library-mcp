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
  it('"신문" is ambiguous (matches multiple Korean newspapers + pressreader subtitle)', () => {
    const r = findPublication("신문");
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.matches.map(p => p.id);
      // pressreader subtitle "전세계 신문/잡지 메인" also contains "신문"
      expect(ids).toContain("pressreader");
      expect(ids).toContain("hankyoreh");
      expect(ids).toContain("kyunghyang");
      expect(ids.length).toBe(3);
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
