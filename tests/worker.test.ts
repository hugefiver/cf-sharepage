import { describe, expect, it } from "vitest";
import rootSkill from "../SKILL.md?raw";
import worker from "../src/index";
import {
  indexKey,
  manifestKey,
  publishRoot,
  readManifest,
  versionRoot,
  type R2BucketLike,
} from "../src/storage";
import type { CreatePageResult, Env, UpdatePageResult } from "../src/types";
import { createFakeBucket } from "./helpers/fake-r2";

const createHtml = "<!DOCTYPE html><html><body>version 0</body></html>";
const updateHtml = "<!DOCTYPE html><html><body>version 1</body></html>";
const runtimeSkillOrigin = "https://prod.example.com";
const rootSkillMarkdown = rootSkill.trimEnd();

function expectedRuntimeSkillMarkdown(origin: string): string {
  return rootSkillMarkdown
    .replace(
      "- `baseUrl`: the deployed service origin, for example `https://share.example.com`.",
      `- \`baseUrl\`: the deployed service origin: \`${origin}\`.`,
    )
    .replaceAll("https://...", origin)
    .replace(
      "- `BASE_URL`: service origin, for example `https://share.example.com`.",
      `- Service origin: \`${origin}\`.`,
    )
    .replaceAll("$BASE_URL", origin);
}

type TestFetchHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Response | Promise<Response>;

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SPA_BUCKET: createFakeBucket() as unknown as R2Bucket,
    PUBLISH_TOKEN: "publish-secret",
    UPDATE_TOKEN_SECRET: "update-secret",
    ...overrides,
  };
}

function makeEnvWithThrowingBucket(
  method: "get" | "put",
  errorMessage: string,
): Env {
  const bucket = createFakeBucket();
  const throwingBucket: R2BucketLike = {
    get:
      method === "get"
        ? async () => {
            throw new Error(errorMessage);
          }
        : (key) => bucket.get(key),
    put:
      method === "put"
        ? async () => {
            throw new Error(errorMessage);
          }
        : (key, value, options) => bucket.put(key, value, options),
  };

  return makeEnv({ SPA_BUCKET: throwingBucket as unknown as R2Bucket });
}

function makeContext(): ExecutionContext {
  return {
    waitUntil(_promise: Promise<unknown>) {
    },
    passThroughOnException() {
    },
    props: undefined,
  };
}

async function callWorker(request: Request, env: Env): Promise<Response> {
  const fetchHandler = worker.fetch;
  if (fetchHandler === undefined) {
    throw new Error("Worker fetch handler missing");
  }

  return (fetchHandler as unknown as TestFetchHandler)(
    request,
    env,
    makeContext(),
  );
}

function postHtml(
  url: string,
  html: string,
  token?: string,
  contentType = "text/html; charset=utf-8",
): Request {
  const headers = new Headers({ "content-type": contentType });
  if (token !== undefined) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return new Request(url, {
    method: "POST",
    headers,
    body: html,
  });
}

async function createPageViaWorker(
  env: Env,
  html = createHtml,
): Promise<CreatePageResult> {
  const response = await callWorker(
    postHtml("https://example.com/app", html, env.PUBLISH_TOKEN),
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as CreatePageResult;
}

async function updatePageViaWorker(
  env: Env,
  period: string,
  pageId: string,
  updateToken: string,
  html = updateHtml,
): Promise<UpdatePageResult> {
  const response = await callWorker(
    postHtml(
      `https://example.com/app/${period}/${pageId}/versions`,
      html,
      updateToken,
    ),
    env,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as UpdatePageResult;
}

describe("worker fetch handler", () => {
  it("serves instance-specific skill markdown for GET /SKILL.md", async () => {
    const env = makeEnv();

    const response = await callWorker(
      new Request(`${runtimeSkillOrigin}/SKILL.md`),
      env,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(body).toBe(expectedRuntimeSkillMarkdown(runtimeSkillOrigin));
    expect(body).toContain("name: cf-sharepage");
    expect(body).toContain(`curl -X POST "${runtimeSkillOrigin}/app"`);
    expect(body).toContain(
      `curl -X POST "${runtimeSkillOrigin}/app/$PERIOD/$PAGE_ID/versions"`,
    );
    expect(body).toContain(`curl -i "${runtimeSkillOrigin}/s/$PERIOD/$PAGE_ID"`);
    expect(body).toContain("$PUBLISH_TOKEN");
    expect(body).toContain("$UPDATE_TOKEN");
    expect(body).not.toContain("CF_SHAREPAGE");
    expect(body).not.toContain("$BASE_URL");
    expect(body).not.toContain("https://share.example.com");
    expect(body).not.toContain("PowerShell");
    expect(body).not.toContain("curl.exe");
  });

  it("serves skill headers without a body for HEAD /SKILL.md", async () => {
    const env = makeEnv();

    const response = await callWorker(
      new Request(`${runtimeSkillOrigin}/SKILL.md`, { method: "HEAD" }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(await response.text()).toBe("");
  });

  it("returns 405 for unsupported methods on /SKILL.md", async () => {
    const env = makeEnv();

    const response = await callWorker(
      new Request(`${runtimeSkillOrigin}/SKILL.md`, { method: "POST" }),
      env,
    );

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "method not allowed" });
  });

  it("creates a page on POST /app", async () => {
    const env = makeEnv();

    const response = await callWorker(
      postHtml("https://example.com/app", createHtml, env.PUBLISH_TOKEN),
      env,
    );
    const body = (await response.json()) as CreatePageResult;

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(body.pageId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(body.period).toMatch(/^\d{6}$/);
    expect(body.version).toBe(0);
    expect(body.shareUrl).toBe(
      `https://example.com/s/${body.period}/${body.pageId}`,
    );
    expect(body.updateToken.length).toBeGreaterThan(0);

    const bucket = env.SPA_BUCKET as unknown as R2BucketLike;
    const manifest = await readManifest(bucket, body.period, body.pageId);
    expect(manifest).not.toBeNull();
    if (manifest === null) {
      throw new Error("manifest missing");
    }

    expect(manifest.latestVersion).toBe(0);
    expect(manifest.versions).toHaveLength(1);
    expect(
      (env.SPA_BUCKET as unknown as ReturnType<typeof createFakeBucket>).keys(),
    ).toEqual(
      expect.arrayContaining([
        manifestKey(body.period, body.pageId),
        indexKey(versionRoot(body.period, body.pageId, 0)),
        indexKey(publishRoot(body.period, body.pageId)),
      ]),
    );
  });

  it("updates an existing page on POST /app/YYYYMM/{pageId}/versions", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);

    const response = await callWorker(
      postHtml(
        `https://example.com/app/${created.period}/${created.pageId}/versions`,
        updateHtml,
        created.updateToken,
      ),
      env,
    );
    const body = (await response.json()) as UpdatePageResult;

    expect(response.status).toBe(201);
    expect(body.pageId).toBe(created.pageId);
    expect(body.period).toBe(created.period);
    expect(body.version).toBe(1);
    expect(body.shareUrl).toBe(created.shareUrl);
    expect(body.versionUrl).toBe(
      `https://example.com/s/${created.period}/${created.pageId}/versions/1`,
    );

    const manifest = await readManifest(
      env.SPA_BUCKET as unknown as R2BucketLike,
      created.period,
      created.pageId,
    );
    expect(manifest).not.toBeNull();
    if (manifest === null) {
      throw new Error("manifest missing");
    }

    expect(manifest.latestVersion).toBe(1);
    expect(manifest.versions).toHaveLength(2);
  });

  it("serves the latest share route for GET and HEAD", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);
    await updatePageViaWorker(
      env,
      created.period,
      created.pageId,
      created.updateToken,
    );

    const getResponse = await callWorker(
      new Request(`https://example.com/s/${created.period}/${created.pageId}`),
      env,
    );

    expect(getResponse.status).toBe(200);
    expect(await getResponse.text()).toBe(updateHtml);
    expect(getResponse.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(getResponse.headers.get("cache-control")).toBe("no-cache");

    const headResponse = await callWorker(
      new Request(`https://example.com/s/${created.period}/${created.pageId}`, {
        method: "HEAD",
      }),
      env,
    );

    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-type")).toBe(
      getResponse.headers.get("content-type"),
    );
    expect(headResponse.headers.get("cache-control")).toBe(
      getResponse.headers.get("cache-control"),
    );
    expect(await headResponse.text()).toBe("");
  });

  it("serves the fixed-version share route", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);
    await updatePageViaWorker(
      env,
      created.period,
      created.pageId,
      created.updateToken,
    );

    const response = await callWorker(
      new Request(
        `https://example.com/s/${created.period}/${created.pageId}/versions/0`,
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(createHtml);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("rejects missing or invalid publish tokens", async () => {
    const env = makeEnv();

    const missingResponse = await callWorker(
      postHtml("https://example.com/app", createHtml),
      env,
    );
    expect(missingResponse.status).toBe(401);
    expect(await missingResponse.json()).toEqual({
      error: "invalid publish token",
    });

    const invalidResponse = await callWorker(
      postHtml("https://example.com/app", createHtml, "wrong-token"),
      env,
    );
    expect(invalidResponse.status).toBe(401);
    expect(await invalidResponse.json()).toEqual({
      error: "invalid publish token",
    });
    expect(
      (env.SPA_BUCKET as unknown as ReturnType<typeof createFakeBucket>).keys(),
    ).toHaveLength(0);
  });

  it("rejects a missing update token", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);

    const response = await callWorker(
      postHtml(
        `https://example.com/app/${created.period}/${created.pageId}/versions`,
        updateHtml,
      ),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "missing update token" });
  });

  it("rejects a wrong update token", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);

    const response = await callWorker(
      postHtml(
        `https://example.com/app/${created.period}/${created.pageId}/versions`,
        updateHtml,
        "wrong-token",
      ),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid update token" });
  });

  it("rejects non-HTML content types", async () => {
    const env = makeEnv();

    const response = await callWorker(
      postHtml(
        "https://example.com/app",
        createHtml,
        env.PUBLISH_TOKEN,
        "application/json",
      ),
      env,
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: "Expected text/html, got application/json",
    });
  });

  it("rejects oversized bodies", async () => {
    const env = makeEnv({ MAX_HTML_BYTES: "16" });

    const response = await callWorker(
      postHtml("https://example.com/app", createHtml, env.PUBLISH_TOKEN),
      env,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Request body exceeds maximum allowed size",
    });
  });

  it("returns 405 for unsupported methods on known routes", async () => {
    const env = makeEnv();
    const created = await createPageViaWorker(env);

    const createMethodResponse = await callWorker(
      new Request("https://example.com/app", { method: "GET" }),
      env,
    );
    expect(createMethodResponse.status).toBe(405);
    expect(await createMethodResponse.json()).toEqual({
      error: "method not allowed",
    });

    const shareMethodResponse = await callWorker(
      new Request(`https://example.com/s/${created.period}/${created.pageId}`, {
        method: "POST",
      }),
      env,
    );
    expect(shareMethodResponse.status).toBe(405);
    expect(await shareMethodResponse.json()).toEqual({
      error: "method not allowed",
    });
  });

  it("returns 404 for unknown routes", async () => {
    const env = makeEnv();

    const response = await callWorker(
      new Request("https://example.com/not-a-route"),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("returns a generic 500 for unexpected create errors containing token or not found", async () => {
    const env = makeEnvWithThrowingBucket(
      "put",
      "r2 token not found secret detail",
    );

    const response = await callWorker(
      postHtml("https://example.com/app", createHtml, env.PUBLISH_TOKEN),
      env,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({ error: "internal error" });
  });

  it("returns a generic 500 for unexpected share errors without exposing internal details", async () => {
    const env = makeEnvWithThrowingBucket(
      "get",
      "r2 token not found secret detail",
    );

    const response = await callWorker(
      new Request("https://example.com/s/202606/abcdefghijklmnop"),
      env,
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({ error: "internal error" });
  });

  it("maps publisher not found errors to 404", async () => {
    const env = makeEnv();

    const response = await callWorker(
      postHtml(
        "https://example.com/app/202606/abcdefghijklmnop/versions",
        updateHtml,
        "token",
      ),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "page not found" });
  });

  describe("homepage", () => {
    it("serves homepage HTML on GET /", async () => {
      const env = makeEnv();

      const response = await callWorker(
        new Request("https://example.com/"),
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      const body = await response.text();
      expect(body).toContain("Share An HTML");
      expect(body).toContain("Cloudflare Worker");
      expect(body).toContain("https://example.com/app");
      expect(body).toContain("Quick Start");
      expect(body).toContain("API Routes");
      expect(body).not.toContain("{{origin}}");
    });

    it("serves homepage headers without body on HEAD /", async () => {
      const env = makeEnv();

      const response = await callWorker(
        new Request("https://example.com/", { method: "HEAD" }),
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(await response.text()).toBe("");
    });

    it("returns 405 for unsupported methods on /", async () => {
      const env = makeEnv();

      const response = await callWorker(
        new Request("https://example.com/", { method: "POST" }),
        env,
      );

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "method not allowed" });
    });
  });

  it("maps other publisher errors to 400", async () => {
    const env = makeEnv({ MAX_VERSIONS: "1" });
    const created = await createPageViaWorker(env);

    const response = await callWorker(
      postHtml(
        `https://example.com/app/${created.period}/${created.pageId}/versions`,
        updateHtml,
        created.updateToken,
      ),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "maximum versions reached",
    });
  });
});
