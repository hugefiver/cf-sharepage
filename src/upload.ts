import type { ExtractedUpload, RuntimeLimits } from "./types";

export class UploadValidationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadValidationError";
    this.status = status;
  }
}

const HTML_MIME = "text/html";

/**
 * Parse the primary MIME type from a Content-Type header value,
 * stripping parameters and normalising case.
 * Returns `null` when the header is absent.
 */
function parsePrimaryType(contentType: string | null): string | null {
  if (contentType === null) return null;
  return (contentType.split(";")[0] ?? "").trim().toLowerCase();
}

/**
 * Validate a raw single-file HTML upload and return the extracted data.
 *
 * - Rejects missing or non-HTML Content-Type with status 415.
 * - Rejects empty bodies with status 400.
 * - Rejects bodies exceeding `maxHtmlBytes` with status 413.
 * - Checks the decoded first 512 characters for HTML markers.
 * - Returns an `ExtractedUpload` containing exactly one `index.html` file.
 */
export function validateHtmlUpload(
  body: ArrayBuffer,
  contentType: string | null,
  limits: RuntimeLimits,
): ExtractedUpload {
  const primaryType = parsePrimaryType(contentType);

  if (primaryType === null) {
    throw new UploadValidationError("Missing Content-Type header", 415);
  }
  if (primaryType !== HTML_MIME) {
    throw new UploadValidationError(
      `Expected text/html, got ${primaryType}`,
      415,
    );
  }

  if (body.byteLength === 0) {
    throw new UploadValidationError("Empty request body", 400);
  }

  if (body.byteLength > limits.maxHtmlBytes) {
    throw new UploadValidationError(
      "Request body exceeds maximum allowed size",
      413,
    );
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(body);
  const preview = text.slice(0, 512).trim().toLowerCase();

  if (!preview.includes("<!doctype html") && !preview.includes("<html")) {
    throw new UploadValidationError(
      "Request body does not appear to be HTML",
      400,
    );
  }

  return {
    files: [
      {
        path: "index.html",
        bytes: new Uint8Array(body),
        contentType: "text/html; charset=utf-8",
      },
    ],
    fileCount: 1,
    totalBytes: body.byteLength,
  };
}
