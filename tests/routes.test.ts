import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/routes";

// Valid pageId: 18 chars (within the 16-64 range required by PAGE_ID_PATTERN)
const VALID_PAGE_ID = "page_123456789012";

describe("parseRoute", () => {
  describe("create route", () => {
    it("parses /app as create route", () => {
      expect(parseRoute(new URL("https://x.test/app"))).toEqual({ kind: "create" });
    });

    it("rejects /app/ with extra path as notFound", () => {
      expect(parseRoute(new URL("https://x.test/app/extra"))).toEqual({ kind: "notFound" });
    });
  });

  describe("update route", () => {
    it("parses /app/YYYYMM/{pageId}/versions as update route", () => {
      expect(parseRoute(new URL(`https://x.test/app/202606/${VALID_PAGE_ID}/versions`))).toEqual({
        kind: "update",
        period: "202606",
        pageId: VALID_PAGE_ID,
      });
    });

    it("rejects update with invalid period", () => {
      expect(parseRoute(new URL(`https://x.test/app/2026/${VALID_PAGE_ID}/versions`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects update with invalid pageId", () => {
      expect(parseRoute(new URL("https://x.test/app/202606/short/versions"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects /app/YYYYMM/{pageId} without versions segment", () => {
      expect(parseRoute(new URL(`https://x.test/app/202606/${VALID_PAGE_ID}`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects /app/YYYYMM/{pageId}/versions/{n} (too many segments)", () => {
      expect(parseRoute(new URL(`https://x.test/app/202606/${VALID_PAGE_ID}/versions/1`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects update with empty pageId segment", () => {
      expect(parseRoute(new URL("https://x.test/app/202606//versions"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects update with double-slash before valid pageId", () => {
      expect(
        parseRoute(new URL(`https://x.test/app/202606//${VALID_PAGE_ID}/versions`)),
      ).toEqual({
        kind: "notFound",
      });
    });
  });

  describe("latest share route (version: null)", () => {
    it("parses /s/YYYYMM/{pageId} with empty asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: null,
        assetPath: "",
      });
    });

    it("parses /s/YYYYMM/{pageId}/ with trailing slash as empty asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: null,
        assetPath: "",
      });
    });

    it("parses /s/YYYYMM/{pageId}/... asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/admin/settings`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: null,
        assetPath: "admin/settings",
      });
    });

    it("parses /s/YYYYMM/{pageId}/assets/app.js as asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/assets/app.js`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: null,
        assetPath: "assets/app.js",
      });
    });

    it("preserves double-slash in latest share asset path", () => {
      expect(
        parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/assets//app.js`)),
      ).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: null,
        assetPath: "assets//app.js",
      });
    });
  });

  describe("fixed version share route (version: number)", () => {
    it("parses /s/YYYYMM/{pageId}/versions/{n} with empty asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/2`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: 2,
        assetPath: "",
      });
    });

    it("parses /s/YYYYMM/{pageId}/versions/{n}/ with trailing slash as empty asset path", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/2/`))).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: 2,
        assetPath: "",
      });
    });

    it("parses /s/YYYYMM/{pageId}/versions/{n}/... asset path", () => {
      expect(
        parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/2/assets/app.js`)),
      ).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: 2,
        assetPath: "assets/app.js",
      });
    });

    it("parses /s/YYYYMM/{pageId}/versions/{n}/deep/path/to/file", () => {
      expect(
        parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/5/a/b/c`)),
      ).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: 5,
        assetPath: "a/b/c",
      });
    });

    it("preserves double-slash in fixed version asset path", () => {
      expect(
        parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/2/assets//app.js`)),
      ).toEqual({
        kind: "share",
        period: "202606",
        pageId: VALID_PAGE_ID,
        version: 2,
        assetPath: "assets//app.js",
      });
    });
  });

  describe("invalid routes", () => {
    it("rejects invalid period (5 digits)", () => {
      expect(parseRoute(new URL(`https://x.test/s/2026/${VALID_PAGE_ID}`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects invalid period (letters)", () => {
      expect(parseRoute(new URL(`https://x.test/s/abcdef/${VALID_PAGE_ID}`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects short pageId (less than 16 chars)", () => {
      expect(parseRoute(new URL("https://x.test/s/202606/short"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects empty pageId segment", () => {
      expect(parseRoute(new URL("https://x.test/s/202606//path"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects double-slash between period and pageId in share route", () => {
      expect(
        parseRoute(new URL(`https://x.test/s/202606//${VALID_PAGE_ID}`)),
      ).toEqual({
        kind: "notFound",
      });
    });

    it("rejects non-numeric version", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/abc`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects negative version", () => {
      expect(parseRoute(new URL(`https://x.test/s/202606/${VALID_PAGE_ID}/versions/-1`))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects unknown top-level routes", () => {
      expect(parseRoute(new URL("https://x.test/unknown"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects root path", () => {
      expect(parseRoute(new URL("https://x.test/"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects /s without period and pageId", () => {
      expect(parseRoute(new URL("https://x.test/s"))).toEqual({
        kind: "notFound",
      });
    });

    it("rejects /s/YYYYMM without pageId", () => {
      expect(parseRoute(new URL("https://x.test/s/202606"))).toEqual({
        kind: "notFound",
      });
    });
  });
});
