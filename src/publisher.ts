import { readLimits } from "./config";
import {
  createPageId,
  createUpdateToken,
  hashUpdateToken,
  secureTokenEqual,
} from "./crypto";
import {
  readManifest,
  versionRoot,
  publishRoot,
  writeManifest,
  writePublishHtml,
  writeVersionHtml,
} from "./storage";
import type {
  CreatePageResult,
  Env,
  ExtractedUpload,
  PageManifest,
  UpdatePageResult,
  VersionRecord,
} from "./types";

function toPeriod(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

function extractIndexHtml(upload: ExtractedUpload): Uint8Array {
  const file = upload.files[0];
  if (file === undefined || file.path !== "index.html") {
    throw new Error("validated upload must contain index.html");
  }
  return file.bytes;
}

export async function createPage(
  env: Env,
  upload: ExtractedUpload,
  origin: URL,
  now: Date = new Date(),
): Promise<CreatePageResult> {
  const html = extractIndexHtml(upload);
  const pageId = createPageId();
  const updateToken = createUpdateToken();
  const period = toPeriod(now);
  const limits = readLimits(env);
  const tokenHash = await hashUpdateToken(
    env.UPDATE_TOKEN_SECRET,
    pageId,
    updateToken,
  );

  // Write immutable version 0 and publish (R2 has no hard links)
  await writeVersionHtml(env.SPA_BUCKET, period, pageId, 0, html);
  await writePublishHtml(env.SPA_BUCKET, period, pageId, html);

  const createdAt = now.toISOString();
  const versionRecord: VersionRecord = {
    version: 0,
    createdAt,
    fileCount: upload.fileCount,
    totalBytes: upload.totalBytes,
    root: versionRoot(period, pageId, 0),
  };

  const manifest: PageManifest = {
    pageId,
    period,
    latestVersion: 0,
    maxVersions: limits.maxVersions,
    tokenHash,
    publishRoot: publishRoot(period, pageId),
    createdAt,
    updatedAt: createdAt,
    versions: [versionRecord],
  };

  await writeManifest(env.SPA_BUCKET, manifest);

  const shareUrl = new URL(`/s/${period}/${pageId}`, origin).toString();
  return {
    pageId,
    period,
    version: 0,
    shareUrl,
    updateToken,
  };
}

export async function updatePage(
  env: Env,
  period: string,
  pageId: string,
  updateToken: string,
  upload: ExtractedUpload,
  origin: URL,
  now: Date = new Date(),
): Promise<UpdatePageResult> {
  const html = extractIndexHtml(upload);
  const manifest = await readManifest(env.SPA_BUCKET, period, pageId);
  if (manifest === null) {
    throw new Error("page not found");
  }

  // Validate update token by HMAC only
  const providedHash = await hashUpdateToken(
    env.UPDATE_TOKEN_SECRET,
    pageId,
    updateToken,
  );
  if (!secureTokenEqual(providedHash, manifest.tokenHash)) {
    throw new Error("invalid update token");
  }

  // Enforce version limit
  const maxVersions = manifest.maxVersions;
  if (manifest.versions.length >= maxVersions) {
    throw new Error("maximum versions reached");
  }

  const nextVersion = manifest.latestVersion + 1;
  const createdAt = now.toISOString();

  // Write immutable version and refresh publish
  await writeVersionHtml(env.SPA_BUCKET, period, pageId, nextVersion, html);
  await writePublishHtml(env.SPA_BUCKET, period, pageId, html);

  const versionRecord: VersionRecord = {
    version: nextVersion,
    createdAt,
    fileCount: upload.fileCount,
    totalBytes: upload.totalBytes,
    root: versionRoot(period, pageId, nextVersion),
  };

  manifest.latestVersion = nextVersion;
  manifest.updatedAt = createdAt;
  manifest.versions.push(versionRecord);

  await writeManifest(env.SPA_BUCKET, manifest);

  const shareUrl = new URL(`/s/${period}/${pageId}`, origin).toString();
  const versionUrl = new URL(
    `/s/${period}/${pageId}/versions/${nextVersion}`,
    origin,
  ).toString();

  return {
    pageId,
    period,
    version: nextVersion,
    shareUrl,
    versionUrl,
  };
}
