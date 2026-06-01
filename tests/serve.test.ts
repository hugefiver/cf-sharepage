import { describe, expect, it } from "vitest";
import { serveShareRoute } from "../src/serve";
import { publishRoot, versionRoot, indexKey } from "../src/storage";
import { createFakeBucket } from "./helpers/fake-r2";

const period = "202606";
const pageId = "test-page-id-for-serve";
const htmlContent = "<!DOCTYPE html><html><head></head><body>Hello</body></html>";
const htmlBytes = new TextEncoder().encode(htmlContent);

// ---------------------------------------------------------------------------
// Fake Cache for testing cache-first behavior
// ---------------------------------------------------------------------------

class FakeCache {
  private store = new Map<string, Response>();

  async match(request: RequestInfo): Promise<Response | undefined> {
    const url = typeof request === "string" ? request : request.url;
    const cached = this.store.get(url);
    return cached?.clone();
  }

  async put(request: RequestInfo, response: Response): Promise<undefined> {
    const url = typeof request === "string" ? request : request.url;
    this.store.set(url, response.clone());
  }

  async delete(request: RequestInfo): Promise<boolean> {
    const url = typeof request === "string" ? request : request.url;
    return this.store.delete(url);
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function putPublishHtml(
  bucket: ReturnType<typeof createFakeBucket>,
  content: Uint8Array = htmlBytes,
): Promise<void> {
  const key = indexKey(publishRoot(period, pageId));
  await bucket.put(key, content, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
}

async function putVersionHtml(
  bucket: ReturnType<typeof createFakeBucket>,
  version: number,
  content: Uint8Array = htmlBytes,
): Promise<void> {
  const key = indexKey(versionRoot(period, pageId, version));
  await bucket.put(key, content, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
}

async function readBodyText(response: Response): Promise<string> {
  return response.text();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("serveShareRoute", () => {
  // --- 1. latest route serves publish index by default ---
  it("serves publish index for latest share with empty asset path", async () => {
    const bucket = createFakeBucket();
    await putPublishHtml(bucket);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
    );

    expect(response.status).toBe(200);
    const body = await readBodyText(response);
    expect(body).toBe(htmlContent);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  // --- 2. fixed version route serves version index ---
  it("serves version index for fixed-version share with empty asset path", async () => {
    const bucket = createFakeBucket();
    await putVersionHtml(bucket, 3);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      3,
      "",
    );

    expect(response.status).toBe(200);
    const body = await readBodyText(response);
    expect(body).toBe(htmlContent);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  // --- 3. unknown latest asset path falls back to publish index (SPA) ---
  it("falls back to publish index for unknown latest asset path", async () => {
    const bucket = createFakeBucket();
    await putPublishHtml(bucket);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "admin/settings",
    );

    expect(response.status).toBe(200);
    const body = await readBodyText(response);
    expect(body).toBe(htmlContent);
  });

  // --- 4. unknown fixed-version asset path falls back to version index (SPA) ---
  it("falls back to version index for unknown fixed-version asset path", async () => {
    const bucket = createFakeBucket();
    await putVersionHtml(bucket, 2);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      2,
      "assets/app.js",
    );

    expect(response.status).toBe(200);
    const body = await readBodyText(response);
    expect(body).toBe(htmlContent);
  });

  // --- 5. missing page/index returns 404 ---
  it("returns 404 when publish index is missing", async () => {
    const bucket = createFakeBucket();
    // No HTML published

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when version index is missing", async () => {
    const bucket = createFakeBucket();
    // No HTML published for this version

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      5,
      "",
    );

    expect(response.status).toBe(404);
  });

  // --- 6. fixed version responses use immutable cache-control ---
  it("sets immutable cache-control on fixed-version responses", async () => {
    const bucket = createFakeBucket();
    await putVersionHtml(bucket, 1);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      1,
      "",
    );

    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  // --- 7. latest responses use no-cache ---
  it("sets no-cache on latest (publish) responses", async () => {
    const bucket = createFakeBucket();
    await putPublishHtml(bucket);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
    );

    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  it("defaults content-type to text/html when R2 metadata has no contentType", async () => {
    const bucket = createFakeBucket();
    const publishKey = indexKey(publishRoot(period, pageId));
    await bucket.put(publishKey, htmlBytes);

    const response = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
    );

    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
  });

  // --- 8. default cache path uses caches.default for immutable fixed-version routes ---
  // Workers vitest pool Cache API is a no-op stub (put succeeds, match → undefined).
  // This test replaces caches.default with a working FakeCache to verify the runtimeCache() code path.
  it("uses caches.default for cache-first on fixed-version routes", async () => {
    const versionPeriod = "202608";
    const versionPageId = "default-cache-fixed-page-id";
    const bucket = createFakeBucket();

    const versionKey = indexKey(versionRoot(versionPeriod, versionPageId, 0));
    await bucket.put(versionKey, htmlBytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });

    const fakeDefault = new FakeCache() as unknown as Cache;
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      caches,
      "default",
    );
    Object.defineProperty(caches, "default", {
      value: fakeDefault,
      writable: true,
      configurable: true,
    });
    try {
      const response1 = await serveShareRoute(
        bucket as unknown as import("../src/storage").R2BucketLike,
        versionPeriod,
        versionPageId,
        0,
        "",
      );
      expect(response1.status).toBe(200);
      const body1 = await readBodyText(response1);
      expect(body1).toBe(htmlContent);
      expect(response1.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );

      await bucket.delete(versionKey);
      const objAfterDelete = await bucket.get(versionKey);
      expect(objAfterDelete).toBeNull();

      const response2 = await serveShareRoute(
        bucket as unknown as import("../src/storage").R2BucketLike,
        versionPeriod,
        versionPageId,
        0,
        "",
      );
      expect(response2.status).toBe(200);
      const body2 = await readBodyText(response2);
      expect(body2).toBe(htmlContent);
    } finally {
      if (originalDescriptor !== undefined) {
        Object.defineProperty(caches, "default", originalDescriptor);
      }
    }
  });

  // --- 9. latest bypasses worker cache; fixed-version uses cache-first ---
  it("bypasses worker cache for latest (publish) routes", async () => {
    const bucket = createFakeBucket();
    await putPublishHtml(bucket);
    const cache = new FakeCache() as unknown as Cache;

    const first = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
      cache,
    );
    expect(first.status).toBe(200);
    expect(await readBodyText(first)).toBe(htmlContent);

    const newContent = "<html><body>updated</body></html>";
    const newBytes = new TextEncoder().encode(newContent);
    const publishKey = indexKey(publishRoot(period, pageId));
    await bucket.put(publishKey, newBytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });

    const second = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      null,
      "",
      cache,
    );
    expect(second.status).toBe(200);
    expect(await readBodyText(second)).toBe(newContent);
  });

  it("uses cache-first for immutable fixed-version routes", async () => {
    const bucket = createFakeBucket();
    await putVersionHtml(bucket, 0);
    const cache = new FakeCache() as unknown as Cache;

    const response1 = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      0,
      "",
      cache,
    );
    expect(response1.status).toBe(200);
    expect(await readBodyText(response1)).toBe(htmlContent);

    const versionKey = indexKey(versionRoot(period, pageId, 0));
    await bucket.delete(versionKey);
    const objAfterDelete = await bucket.get(versionKey);
    expect(objAfterDelete).toBeNull();

    const response2 = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      0,
      "",
      cache,
    );
    expect(response2.status).toBe(200);
    expect(await readBodyText(response2)).toBe(htmlContent);
  });

  it("shares the fixed-version cache entry across fallback asset paths", async () => {
    const bucket = createFakeBucket();
    await putVersionHtml(bucket, 0);
    const cache = new FakeCache() as unknown as Cache;

    const first = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      0,
      "admin/settings",
      cache,
    );
    expect(first.status).toBe(200);
    expect(await readBodyText(first)).toBe(htmlContent);

    const versionKey = indexKey(versionRoot(period, pageId, 0));
    await bucket.delete(versionKey);
    expect(await bucket.get(versionKey)).toBeNull();

    const second = await serveShareRoute(
      bucket as unknown as import("../src/storage").R2BucketLike,
      period,
      pageId,
      0,
      "another/fallback/path",
      cache,
    );
    expect(second.status).toBe(200);
    expect(await readBodyText(second)).toBe(htmlContent);
  });
});
