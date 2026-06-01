export interface Env {
  SPA_BUCKET: R2Bucket;
  PUBLISH_TOKEN: string;
  UPDATE_TOKEN_SECRET: string;
  MAX_HTML_BYTES?: string;
  MAX_VERSIONS?: string;
}

export interface RuntimeLimits {
  maxHtmlBytes: number;
  maxVersions: number;
}

export interface VersionRecord {
  version: number;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  root: string;
}

export interface PageManifest {
  pageId: string;
  period: string;
  latestVersion: number;
  maxVersions: number;
  tokenHash: string;
  publishRoot: string;
  createdAt: string;
  updatedAt: string;
  versions: VersionRecord[];
}

export interface ExtractedFile {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface ExtractedUpload {
  files: ExtractedFile[];
  fileCount: number;
  totalBytes: number;
}

export interface CreatePageResult {
  pageId: string;
  period: string;
  version: number;
  shareUrl: string;
  updateToken: string;
}

export interface UpdatePageResult {
  pageId: string;
  period: string;
  version: number;
  shareUrl: string;
  versionUrl: string;
}
