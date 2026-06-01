import { describe, expect, it } from "vitest";
import {
  manifestKey,
  versionRoot,
  publishRoot,
  indexKey,
  readManifest,
  writeManifest,
  writeVersionHtml,
  writePublishHtml,
} from "../src/storage";
import { createFakeBucket } from "./helpers/fake-r2";

const period = "202606";
const pageId = "test-page-id";

describe("key helpers", () => {
  it("builds manifest key", () => {
    expect(manifestKey(period, pageId)).toBe(
      "pages/202606/test-page-id/manifest.json",
    );
  });

  it("builds version root", () => {
    expect(versionRoot(period, pageId, 0)).toBe(
      "pages/202606/test-page-id/versions/0/",
    );
    expect(versionRoot(period, pageId, 1)).toBe(
      "pages/202606/test-page-id/versions/1/",
    );
  });

  it("builds publish root", () => {
    expect(publishRoot(period, pageId)).toBe(
      "pages/202606/test-page-id/publish/",
    );
  });

  it("builds index key from root", () => {
    expect(indexKey("pages/202606/test-page-id/publish/")).toBe(
      "pages/202606/test-page-id/publish/index.html",
    );
    expect(indexKey("pages/202606/test-page-id/versions/0/")).toBe(
      "pages/202606/test-page-id/versions/0/index.html",
    );
  });
});

describe("manifest operations", () => {
  it("returns null for missing manifest", async () => {
    const bucket = createFakeBucket();
    const result = await readManifest(bucket, period, pageId);
    expect(result).toBeNull();
  });

  it("roundtrips a manifest", async () => {
    const bucket = createFakeBucket();
    const manifest = {
      pageId,
      period,
      latestVersion: 0,
      maxVersions: 20,
      tokenHash: "abc123",
      publishRoot: publishRoot(period, pageId),
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
      versions: [
        {
          version: 0,
          createdAt: "2026-06-01T00:00:00Z",
          fileCount: 1,
          totalBytes: 100,
          root: versionRoot(period, pageId, 0),
        },
      ],
    };

    await writeManifest(bucket, manifest);
    const read = await readManifest(bucket, period, pageId);

    expect(read).toEqual(manifest);
  });

  it("stores manifest with correct content type", async () => {
    const bucket = createFakeBucket();
    const manifest = {
      pageId,
      period,
      latestVersion: 0,
      maxVersions: 20,
      tokenHash: "abc123",
      publishRoot: publishRoot(period, pageId),
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
      versions: [],
    };

    await writeManifest(bucket, manifest);
    const key = manifestKey(period, pageId);
    const obj = await bucket.get(key);
    expect(obj?.httpMetadata?.contentType).toBe(
      "application/json; charset=utf-8",
    );
  });
});

describe("HTML write operations", () => {
  const htmlBytes = new TextEncoder().encode("<html></html>");

  it("writes version html at correct path", async () => {
    const bucket = createFakeBucket();
    await writeVersionHtml(bucket, period, pageId, 0, htmlBytes);

    const key = indexKey(versionRoot(period, pageId, 0));
    expect(key).toBe("pages/202606/test-page-id/versions/0/index.html");

    const obj = await bucket.get(key);
    expect(obj).not.toBeNull();
    expect(obj?.httpMetadata?.contentType).toBe("text/html; charset=utf-8");
  });

  it("writes publish html at correct path", async () => {
    const bucket = createFakeBucket();
    await writePublishHtml(bucket, period, pageId, htmlBytes);

    const key = indexKey(publishRoot(period, pageId));
    expect(key).toBe("pages/202606/test-page-id/publish/index.html");

    const obj = await bucket.get(key);
    expect(obj).not.toBeNull();
    expect(obj?.httpMetadata?.contentType).toBe("text/html; charset=utf-8");
  });

  it("stores correct html body for version and publish", async () => {
    const bucket = createFakeBucket();
    await writeVersionHtml(bucket, period, pageId, 0, htmlBytes);
    await writePublishHtml(bucket, period, pageId, htmlBytes);

    const versionKey = indexKey(versionRoot(period, pageId, 0));
    const versionObj = await bucket.get(versionKey);
    const versionBody = await new Response(versionObj!.body).arrayBuffer();
    expect(new Uint8Array(versionBody)).toEqual(htmlBytes);

    const publishKey = indexKey(publishRoot(period, pageId));
    const publishObj = await bucket.get(publishKey);
    const publishBody = await new Response(publishObj!.body).arrayBuffer();
    expect(new Uint8Array(publishBody)).toEqual(htmlBytes);
  });
});
