import { describe, expect, it } from "vitest";
import { readLimits } from "../src/config";

describe("readLimits", () => {
  it("parses numeric limits from env strings", () => {
    expect(
      readLimits({
        MAX_HTML_BYTES: "10",
        MAX_VERSIONS: "7",
      }),
    ).toEqual({
      maxHtmlBytes: 10,
      maxVersions: 7,
    });
  });

  it("uses safe defaults when env values are absent", () => {
    expect(readLimits({})).toEqual({
      maxHtmlBytes: 5 * 1024 * 1024,
      maxVersions: 20,
    });
  });

  it("falls back to defaults for invalid env values", () => {
    expect(
      readLimits({
        MAX_HTML_BYTES: "abc",
        MAX_VERSIONS: "-5",
      }),
    ).toEqual({
      maxHtmlBytes: 5 * 1024 * 1024,
      maxVersions: 20,
    });
  });
});
