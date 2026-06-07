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
