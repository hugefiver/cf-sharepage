interface FakeStoredObject {
  data: Uint8Array;
  contentType: string | undefined;
}

export interface FakeR2Object {
  key: string;
  body: ReadableStream<Uint8Array> | null;
  httpMetadata?: { contentType?: string };
  size: number;
}

export interface FakeR2Bucket {
  get(key: string): Promise<FakeR2Object | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ etag: string }>;
  delete(key: string): Promise<void>;
  list(
    options?: { prefix?: string },
  ): Promise<{ objects: { key: string }[]; truncated: boolean }>;
  keys(): string[];
}

export function createFakeBucket(): FakeR2Bucket {
  const store = new Map<string, FakeStoredObject>();

  return {
    async get(
      key: string,
    ): Promise<FakeR2Object | null> {
      const entry = store.get(key);
      if (entry === undefined) return null;

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(entry.data);
          controller.close();
        },
      });

      const result: FakeR2Object = { key, body, size: entry.data.length };
      if (entry.contentType !== undefined) {
        result.httpMetadata = { contentType: entry.contentType };
      }
      return result;
    },

    async put(
      key: string,
      value: string | ArrayBuffer | Uint8Array,
      options?: { httpMetadata?: { contentType?: string } },
    ): Promise<{ etag: string }> {
      let data: Uint8Array;

      if (typeof value === "string") {
        data = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        data = new Uint8Array(value);
      } else {
        data = value;
      }

      store.set(key, {
        data,
        contentType: options?.httpMetadata?.contentType,
      });

      return { etag: crypto.randomUUID() };
    },

    async delete(key: string): Promise<void> {
      store.delete(key);
    },

    async list(
      options?: { prefix?: string },
    ): Promise<{ objects: { key: string }[]; truncated: boolean }> {
      const objects: { key: string }[] = [];
      for (const key of store.keys()) {
        if (options?.prefix !== undefined && !key.startsWith(options.prefix)) {
          continue;
        }
        objects.push({ key });
      }
      return { objects, truncated: false };
    },

    keys(): string[] {
      return Array.from(store.keys());
    },
  };
}
