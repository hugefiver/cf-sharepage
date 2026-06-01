import { describe, expect, it } from "vitest";
import { UploadValidationError, validateHtmlUpload } from "../src/upload";
import type { RuntimeLimits } from "../src/types";

const limits: RuntimeLimits = { maxHtmlBytes: 5 * 1024 * 1024, maxVersions: 20 };

function arrayBufferFrom(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function assertError(
  fn: () => unknown,
  expectedStatus: number,
): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(UploadValidationError);
  expect((thrown as UploadValidationError).status).toBe(expectedStatus);
}

describe("validateHtmlUpload", () => {
  it("accepts valid HTML with doctype", () => {
    const body = arrayBufferFrom(
      "<!doctype html><html><head></head><body><p>Hello</p></body></html>",
    );
    const result = validateHtmlUpload(body, "text/html", limits);

    expect(result.fileCount).toBe(1);
    expect(result.totalBytes).toBe(body.byteLength);
    expect(result.files).toHaveLength(1);
    const file = result.files[0]!;
    expect(file.path).toBe("index.html");
    expect(file.contentType).toBe("text/html; charset=utf-8");
    expect(file.bytes).toEqual(new Uint8Array(body));
  });

  it("accepts valid HTML with <html> tag", () => {
    const body = arrayBufferFrom(
      "<html><head></head><body><p>Hello</p></body></html>",
    );
    const result = validateHtmlUpload(body, "text/html", limits);

    expect(result.fileCount).toBe(1);
    const file = result.files[0]!;
    expect(file.path).toBe("index.html");
    expect(file.contentType).toBe("text/html; charset=utf-8");
    expect(new TextDecoder().decode(file.bytes)).toBe(
      "<html><head></head><body><p>Hello</p></body></html>",
    );
  });

  it("accepts Content-Type with charset parameter", () => {
    const body = arrayBufferFrom("<!doctype html><html></html>");
    const result = validateHtmlUpload(body, "text/html; charset=utf-8", limits);

    expect(result.fileCount).toBe(1);
    expect(result.files[0]!.bytes).toEqual(new Uint8Array(body));
  });

  it("accepts Content-Type case-insensitively", () => {
    const body = arrayBufferFrom("<!doctype html><html></html>");
    const result = validateHtmlUpload(body, "Text/Html", limits);

    expect(result.fileCount).toBe(1);
  });

  it("rejects missing content type with 415", () => {
    const body = arrayBufferFrom("<!doctype html><html></html>");
    assertError(() => validateHtmlUpload(body, null, limits), 415);
  });

  it("rejects non-HTML content type with 415", () => {
    const body = arrayBufferFrom("<!doctype html><html></html>");
    assertError(
      () => validateHtmlUpload(body, "application/json", limits),
      415,
    );
  });

  it("rejects empty body with 400", () => {
    const body = new ArrayBuffer(0);
    assertError(() => validateHtmlUpload(body, "text/html", limits), 400);
  });

  it("rejects oversize body with 413", () => {
    const body = new ArrayBuffer(6 * 1024 * 1024);
    assertError(() => validateHtmlUpload(body, "text/html", limits), 413);
  });

  it("rejects non-HTML-looking body with 400", () => {
    const body = arrayBufferFrom(
      "Just some random text without HTML tags",
    );
    assertError(
      () => validateHtmlUpload(body, "text/html", limits),
      400,
    );
  });
});
