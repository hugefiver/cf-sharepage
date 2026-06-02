/// <reference types="@cloudflare/workers-types" />

import { readLimits } from "./config";
import { secureTokenEqual } from "./crypto";
import { bearerToken, errorResponse, jsonResponse } from "./http";
import { createPage, updatePage } from "./publisher";
import { parseRoute } from "./routes";
import { serveShareRoute } from "./serve";
import { buildSkillMarkdown } from "./skill";
import type { Env } from "./types";
import { UploadValidationError, validateHtmlUpload } from "./upload";

function methodNotAllowed(): Response {
  return errorResponse("method not allowed", 405);
}

function internalError(): Response {
  return errorResponse("internal error", 500);
}

function skillResponse(request: Request): Response {
  return new Response(
    request.method === "HEAD" ? null : buildSkillMarkdown(new URL(request.url).origin),
    { headers: { "content-type": "text/markdown; charset=utf-8" } },
  );
}

function mapDomainError(error: Error): Response {
  switch (error.message) {
    case "page not found":
      return errorResponse(error.message, 404);
    case "invalid update token":
      return errorResponse(error.message, 401);
    case "maximum versions reached":
    case "validated upload must contain index.html":
      return errorResponse(error.message, 400);
    default:
      return internalError();
  }
}

async function parseUpload(request: Request, env: Env) {
  return validateHtmlUpload(
    await request.arrayBuffer(),
    request.headers.get("content-type"),
    readLimits(env),
  );
}

async function handleCreate(request: Request, env: Env): Promise<Response> {
  const token = bearerToken(request);
  if (token === null || !secureTokenEqual(token, env.PUBLISH_TOKEN)) {
    return errorResponse("invalid publish token", 401);
  }

  try {
    const upload = await parseUpload(request, env);
    const result = await createPage(env, upload, new URL(request.url));
    return jsonResponse(result, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof Error) {
      return mapDomainError(error);
    }

    throw error;
  }
}

async function handleUpdate(
  request: Request,
  env: Env,
  period: string,
  pageId: string,
): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) {
    return errorResponse("missing update token", 401);
  }

  try {
    const upload = await parseUpload(request, env);
    const result = await updatePage(
      env,
      period,
      pageId,
      token,
      upload,
      new URL(request.url),
    );
    return jsonResponse(result, 201);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof Error) {
      return mapDomainError(error);
    }

    throw error;
  }
}

async function handleShare(
  request: Request,
  env: Env,
  period: string,
  pageId: string,
  version: number | null,
  assetPath: string,
): Promise<Response> {
  try {
    const response = await serveShareRoute(
      env.SPA_BUCKET,
      period,
      pageId,
      version,
      assetPath,
    );

    if (request.method === "HEAD") {
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return internalError();
    }

    throw error;
  }
}

const handler: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const route = parseRoute(new URL(request.url));

    if (route.kind === "notFound") {
      return errorResponse("not found", 404);
    }

    if (route.kind === "create") {
      if (request.method !== "POST") {
        return methodNotAllowed();
      }

      return handleCreate(request, env);
    }

    if (route.kind === "skill") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      return skillResponse(request);
    }

    if (route.kind === "update") {
      if (request.method !== "POST") {
        return methodNotAllowed();
      }

      return handleUpdate(request, env, route.period, route.pageId);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }

    return handleShare(
      request,
      env,
      route.period,
      route.pageId,
      route.version,
      route.assetPath,
    );
  },
};

export default handler;
