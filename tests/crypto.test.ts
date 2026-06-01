import { describe, expect, it } from "vitest";
import { createPageId, createUpdateToken, hashUpdateToken, secureTokenEqual } from "../src/crypto";

describe("crypto utilities", () => {
  it("generates URL-safe random identifiers", () => {
    const pageId = createPageId();
    const updateToken = createUpdateToken();

    expect(pageId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(updateToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pageId.length).toBeGreaterThanOrEqual(22);
    expect(updateToken.length).toBeGreaterThanOrEqual(43);
    expect(pageId).not.toEqual(updateToken);
  });

  it("hashes update tokens with page binding", async () => {
    const first = await hashUpdateToken("secret", "page-a", "token-a");
    const second = await hashUpdateToken("secret", "page-a", "token-a");
    const differentPage = await hashUpdateToken("secret", "page-b", "token-a");

    expect(first).toEqual(second);
    expect(first).not.toEqual(differentPage);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("compares token hashes without early length success", () => {
    expect(secureTokenEqual("abc", "abc")).toBe(true);
    expect(secureTokenEqual("abc", "abd")).toBe(false);
    expect(secureTokenEqual("abc", "abcd")).toBe(false);
  });
});
