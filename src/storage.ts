import type { PageManifest } from "./types";

// ---------------------------------------------------------------------------
// Narrow R2 interfaces for testability
// ---------------------------------------------------------------------------

export interface R2ObjectLike {
  key: string;
  body: ReadableStream | null;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ etag?: string }>;
  delete?(key: string): Promise<void>;
  list?(
    options?: { prefix?: string },
  ): Promise<{ objects: Array<{ key: string }> }>;
}

// ---------------------------------------------------------------------------
// Key / path helpers
// ---------------------------------------------------------------------------

export function manifestKey(period: string, pageId: string): string {
  return `pages/${period}/${pageId}/manifest.json`;
}

export function versionRoot(
  period: string,
  pageId: string,
  version: number,
): string {
  return `pages/${period}/${pageId}/versions/${version}/`;
}

export function publishRoot(period: string, pageId: string): string {
  return `pages/${period}/${pageId}/publish/`;
}

export function indexKey(root: string): string {
  return `${root}index.html`;
}

// ---------------------------------------------------------------------------
// Manifest read / write
// ---------------------------------------------------------------------------

export async function readManifest(
  bucket: R2BucketLike,
  period: string,
  pageId: string,
): Promise<PageManifest | null> {
  const key = manifestKey(period, pageId);
  const obj = await bucket.get(key);
  if (obj === null) return null;
  if (obj.body === null) return null;

  const text = await new Response(obj.body).text();
  return JSON.parse(text) as PageManifest;
}

export async function writeManifest(
  bucket: R2BucketLike,
  manifest: PageManifest,
): Promise<void> {
  const key = manifestKey(manifest.period, manifest.pageId);
  const json = JSON.stringify(manifest);
  await bucket.put(key, json, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// HTML write helpers (v1 single-file)
// ---------------------------------------------------------------------------

export async function writeVersionHtml(
  bucket: R2BucketLike,
  period: string,
  pageId: string,
  version: number,
  bytes: Uint8Array,
): Promise<void> {
  const key = indexKey(versionRoot(period, pageId, version));
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
}

export async function writePublishHtml(
  bucket: R2BucketLike,
  period: string,
  pageId: string,
  bytes: Uint8Array,
): Promise<void> {
  const key = indexKey(publishRoot(period, pageId));
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
}
