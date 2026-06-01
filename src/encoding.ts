export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function utf8Bytes(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return new Uint8Array(encoded.buffer as ArrayBuffer, encoded.byteOffset, encoded.byteLength);
}
