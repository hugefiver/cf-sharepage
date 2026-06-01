import { describe, expect, it } from "vitest";
import {
  readManifest,
  publishRoot,
  versionRoot,
  writeManifest,
  indexKey,
  type R2BucketLike,
} from "../src/storage";
import { createFakeBucket } from "./helpers/fake-r2";
import type { Env, ExtractedUpload } from "../src/types";

const htmlBytes = new TextEncoder().encode("<html><body>hello</body></html>");
const html2Bytes = new TextEncoder().encode("<html><body>v2</body></html>");

function makeUpload(html: Uint8Array): ExtractedUpload {
  return {
    files: [
      { path: "index.html", bytes: html, contentType: "text/html; charset=utf-8" },
    ],
    fileCount: 1,
    totalBytes: html.length,
  };
}

function makeEnv(maxVersions?: number): Env {
  return {
    SPA_BUCKET: createFakeBucket() as unknown as R2Bucket,
    PUBLISH_TOKEN: "publish-token",
    UPDATE_TOKEN_SECRET: "my-secret",
    ...(maxVersions !== undefined ? { MAX_VERSIONS: String(maxVersions) } : {}),
  };
}

const origin = new URL("https://example.com");
const now = new Date("2026-06-01T12:00:00Z");
const period = "202606";

describe("createPage", () => {
  it("writes manifest, version/0 and publish/index.html, returns update token", async () => {
    // Import dynamically so the file can exist before the function does
    const { createPage } = await import("../src/publisher");
    const env = makeEnv();
    const upload = makeUpload(htmlBytes);
    const result = await createPage(env, upload, origin, now);

    expect(result.period).toBe(period);
    expect(result.version).toBe(0);
    expect(result.shareUrl).toBe(
      `https://example.com/s/${period}/${result.pageId}`,
    );
    expect(result.updateToken).toBeTruthy();
    expect(typeof result.updateToken).toBe("string");
    expect(result.pageId).toBeTruthy();
    expect(typeof result.pageId).toBe("string");

    // Manifest exists and contains correct structure
    const m = await readManifest(
      env.SPA_BUCKET as unknown as R2BucketLike,
      result.period,
      result.pageId,
    );
    expect(m).not.toBeNull();
    if (m === null) throw new Error("unreachable");
    expect(m.pageId).toBe(result.pageId);
    expect(m.period).toBe(period);
    expect(m.latestVersion).toBe(0);
    expect(m.maxVersions).toBe(20); // default
    expect(m.publishRoot).toBe(publishRoot(period, result.pageId));
    expect(m.createdAt).toBe(now.toISOString());
    expect(m.updatedAt).toBe(now.toISOString());
    expect(m.versions).toHaveLength(1);
    expect(m.versions[0]).toEqual({
      version: 0,
      createdAt: now.toISOString(),
      fileCount: 1,
      totalBytes: htmlBytes.length,
      root: versionRoot(period, result.pageId, 0),
    });
    // tokenHash must exist (HMAC of token) - raw token never stored
    expect(m.tokenHash).toBeTruthy();
    expect(typeof m.tokenHash).toBe("string");
    expect(m.tokenHash).not.toBe(result.updateToken);

    // Version 0 html exists and matches
    const versionObj = await env.SPA_BUCKET.get(
      indexKey(versionRoot(period, result.pageId, 0)),
    );
    expect(versionObj).not.toBeNull();
    const versionBody = await new Response(versionObj!.body).arrayBuffer();
    expect(new Uint8Array(versionBody)).toEqual(htmlBytes);

    // Publish html exists and matches
    const publishObj = await env.SPA_BUCKET.get(
      indexKey(publishRoot(period, result.pageId)),
    );
    expect(publishObj).not.toBeNull();
    const publishBody = await new Response(publishObj!.body).arrayBuffer();
    expect(new Uint8Array(publishBody)).toEqual(htmlBytes);
  });

  it("throws when upload has no index.html", async () => {
    const { createPage } = await import("../src/publisher");
    const env = makeEnv();
    const upload: ExtractedUpload = {
      files: [{ path: "other.html", bytes: htmlBytes, contentType: "text/html" }],
      fileCount: 1,
      totalBytes: htmlBytes.length,
    };
    await expect(createPage(env, upload, origin, now)).rejects.toThrow(
      "validated upload must contain index.html",
    );
  });
});

describe("updatePage", () => {
  it("appends version 1 and refreshes publish", async () => {
    const { createPage, updatePage } = await import("../src/publisher");
    const env = makeEnv();
    const upload = makeUpload(htmlBytes);

    const created = await createPage(env, upload, origin, now);

    const now2 = new Date("2026-06-02T12:00:00Z");
    const upload2 = makeUpload(html2Bytes);
    const result = await updatePage(
      env,
      created.period,
      created.pageId,
      created.updateToken,
      upload2,
      origin,
      now2,
    );

    expect(result.pageId).toBe(created.pageId);
    expect(result.period).toBe(period);
    expect(result.version).toBe(1);
    expect(result.shareUrl).toBe(
      `https://example.com/s/${period}/${result.pageId}`,
    );
    expect(result.versionUrl).toBe(
      `https://example.com/s/${period}/${result.pageId}/versions/1`,
    );

    // Manifest updated
    const manifest = await readManifest(
      env.SPA_BUCKET as unknown as R2BucketLike,
      result.period,
      result.pageId,
    );
    expect(manifest).not.toBeNull();
    if (manifest === null) throw new Error("unreachable");
    expect(manifest.latestVersion).toBe(1);
    expect(manifest.updatedAt).toBe(now2.toISOString());
    expect(manifest.createdAt).toBe(now.toISOString());
    expect(manifest.versions).toHaveLength(2);
    expect(manifest.versions[1]).toEqual({
      version: 1,
      createdAt: now2.toISOString(),
      fileCount: 1,
      totalBytes: html2Bytes.length,
      root: versionRoot(period, result.pageId, 1),
    });

    // Version 1 html exists and matches
    const versionObj = await env.SPA_BUCKET.get(
      indexKey(versionRoot(period, result.pageId, 1)),
    );
    expect(versionObj).not.toBeNull();
    const versionBody = await new Response(versionObj!.body).arrayBuffer();
    expect(new Uint8Array(versionBody)).toEqual(html2Bytes);

    // Publish refreshed with new content
    const publishObj = await env.SPA_BUCKET.get(
      indexKey(publishRoot(period, result.pageId)),
    );
    expect(publishObj).not.toBeNull();
    const publishBody = await new Response(publishObj!.body).arrayBuffer();
    expect(new Uint8Array(publishBody)).toEqual(html2Bytes);
  });

  it("rejects with 'page not found' for unknown pageId", async () => {
    const { createPage, updatePage } = await import("../src/publisher");
    const env = makeEnv();
    const upload = makeUpload(htmlBytes);
    const created = await createPage(env, upload, origin, now);

    await expect(
      updatePage(env, period, "nonexistent", created.updateToken, upload, origin, now),
    ).rejects.toThrow("page not found");
  });

  it("rejects with 'invalid update token' for wrong token", async () => {
    const { createPage, updatePage } = await import("../src/publisher");
    const env = makeEnv();
    const upload = makeUpload(htmlBytes);
    const created = await createPage(env, upload, origin, now);

    await expect(
      updatePage(env, period, created.pageId, "wrong-token", upload, origin, now),
    ).rejects.toThrow("invalid update token");
  });

  it("rejects with 'maximum versions reached' when at limit", async () => {
    const { createPage, updatePage } = await import("../src/publisher");
    const env = makeEnv(2); // max 2 versions
    const upload = makeUpload(htmlBytes);
    const created = await createPage(env, upload, origin, now);

    // Update to version 1 (now at limit: 2 versions)
    const now2 = new Date("2026-06-02T12:00:00Z");
    await updatePage(env, period, created.pageId, created.updateToken, makeUpload(html2Bytes), origin, now2);

    // This should fail - we're already at 2 versions
    await expect(
      updatePage(env, period, created.pageId, created.updateToken, makeUpload(html2Bytes), origin, now),
    ).rejects.toThrow("maximum versions reached");
  });

  it("uses UTC month/year for period when date crosses local month boundary", async () => {
    const { createPage } = await import("../src/publisher");
    const env = makeEnv();
    const upload = makeUpload(htmlBytes);
    // 2026-05-31T23:30:00Z is still May in UTC, but June in many timezones
    const boundaryDate = new Date("2026-05-31T23:30:00Z");
    const result = await createPage(env, upload, origin, boundaryDate);

    // Must be 202605 (May UTC), not 202606 (June local)
    expect(result.period).toBe("202605");
  });

  it("uses latestVersion + 1 for next version even when manifest out of sync with versions.length", async () => {
    const { createPage, updatePage } = await import("../src/publisher");
    const env = makeEnv(5); // max 5 versions
    const upload = makeUpload(htmlBytes);
    const created = await createPage(env, upload, origin, now);

    // Read the real manifest, then tamper: set latestVersion to 3
    // while versions.length is still 1. updatePage should use 4 (latestVersion+1),
    // not 1 (versions.length).
    const manifest = await readManifest(
      env.SPA_BUCKET as unknown as R2BucketLike,
      created.period,
      created.pageId,
    );
    if (manifest === null) throw new Error("unreachable");
    manifest.latestVersion = 3;
    await writeManifest(env.SPA_BUCKET as unknown as R2BucketLike, manifest);

    const now2 = new Date("2026-06-02T12:00:00Z");
    const result = await updatePage(
      env,
      created.period,
      created.pageId,
      created.updateToken,
      makeUpload(html2Bytes),
      origin,
      now2,
    );

    expect(result.version).toBe(4);

    // Re-read manifest to confirm it was updated correctly
    const updatedManifest = await readManifest(
      env.SPA_BUCKET as unknown as R2BucketLike,
      created.period,
      created.pageId,
    );
    expect(updatedManifest).not.toBeNull();
    if (updatedManifest === null) throw new Error("unreachable");
    expect(updatedManifest.latestVersion).toBe(4);
    expect(updatedManifest.versions).toHaveLength(2);
    const v1 = updatedManifest.versions[1];
    if (!v1) throw new Error("unreachable");
    expect(v1.version).toBe(4);
  });
});
