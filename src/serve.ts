import type { R2ObjectLike, R2BucketLike } from "./storage";
import { publishRoot, versionRoot, indexKey } from "./storage";

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function responseFromObject(
  obj: R2ObjectLike,
  cacheControl: string,
): Response {
  const contentType =
    obj.httpMetadata?.contentType ?? "text/html; charset=utf-8";
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": cacheControl,
  });
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export function runtimeCache(): Cache | null {
  if (typeof caches === "undefined") return null;
  return (caches as unknown as { readonly default?: Cache }).default ?? null;
}

function cacheKey(
  period: string,
  pageId: string,
  version: number | null,
): string {
  const versionPart = version !== null ? String(version) : "latest";
  return `https://cf-sharepage/${period}/${pageId}/${versionPart}/index.html`;
}

async function cacheFirst(
  cache: Cache,
  key: string,
  fetchFn: () => Promise<Response>,
): Promise<Response> {
  const cached = await cache.match(key);
  if (cached !== undefined) {
    return cached;
  }

  const response = await fetchFn();
  if (response.ok) {
    await cache.put(key, response.clone());
  }
  return response;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function serveShareRoute(
  bucket: R2BucketLike,
  period: string,
  pageId: string,
  version: number | null,
  assetPath: string,
  cache: Cache | null = runtimeCache(),
): Promise<Response> {
  const root =
    version !== null
      ? versionRoot(period, pageId, version)
      : publishRoot(period, pageId);

  // v1: all requests serve index.html from the root (SPA fallback)
  const key = indexKey(root);

  const cacheControl =
    version !== null
      ? "public, max-age=31536000, immutable"
      : "no-cache";

  const fetchFromR2 = async (): Promise<Response> => {
    const obj = await bucket.get(key);
    if (obj === null || obj.body === null) {
      return new Response("Not Found", { status: 404 });
    }
    return responseFromObject(obj, cacheControl);
  };

  if (cache !== null && version !== null) {
    const ck = cacheKey(period, pageId, version);
    return cacheFirst(cache, ck, fetchFromR2);
  }

  return fetchFromR2();
}
