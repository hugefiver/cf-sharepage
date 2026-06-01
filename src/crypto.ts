import { base64UrlEncode, utf8Bytes } from "./encoding";

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function createPageId(): string {
  return randomBase64Url(18);
}

export function createUpdateToken(): string {
  return randomBase64Url(32);
}

export async function hashUpdateToken(secret: string, pageId: string, updateToken: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8Bytes(secret) as Uint8Array<ArrayBuffer>,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    utf8Bytes(`${pageId}:${updateToken}`) as Uint8Array<ArrayBuffer>,
  );
  return base64UrlEncode(new Uint8Array(signature));
}

export function secureTokenEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}
