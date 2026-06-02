---
name: cf-sharepage
description: Use when a third-party agent needs to publish, update, or verify a single-file HTML page through an existing cf-sharepage API endpoint; use for API clients, share links, raw index.html uploads, bearer publish tokens, or bearer update tokens.
---

# cf-sharepage API Client Skill

## Overview

Use this skill to call an existing `cf-sharepage` service from another agent or client. The service publishes one raw HTML document per page version and returns share URLs that serve that document as an SPA fallback.

This skill is for API usage only. Do not use it for developing, deploying, or locally running the `cf-sharepage` service implementation.

## Required Inputs

Before calling the API, identify:

- `baseUrl`: the deployed service origin, for example `https://share.example.com`.
- HTML input: a file path, generated HTML string, or raw HTML bytes.
- For page creation: a publish bearer token.
- For page updates: the existing update bearer token and either the update URL or both `period` and `pageId`.

Ask one focused question if any required input is missing.

## Secret Handling

- Treat publish tokens and update tokens as secrets.
- Send tokens only in the `Authorization: Bearer ...` header.
- Do not put tokens in URLs, logs, committed files, generated HTML, or browser storage.
- Do not print returned update tokens in the final response unless the user needs them for future updates.
- If returning an update token, label it clearly as secret.

## API Contract

### Create Page

```http
POST /app
Authorization: Bearer <publishToken>
Content-Type: text/html

<!doctype html><html>...</html>
```

Expected success response:

```json
{
  "pageId": "public-random-id",
  "period": "YYYYMM",
  "version": 0,
  "shareUrl": "https://.../s/YYYYMM/{pageId}",
  "updateToken": "secret-update-token"
}
```

Store `period`, `pageId`, `shareUrl`, and `updateToken` in the caller's approved secret/state location if future updates are needed.

### Update Page

```http
POST /app/YYYYMM/{pageId}/versions
Authorization: Bearer <updateToken>
Content-Type: text/html

<!doctype html><html>...</html>
```

Expected success response:

```json
{
  "pageId": "public-random-id",
  "period": "YYYYMM",
  "version": 1,
  "shareUrl": "https://.../s/YYYYMM/{pageId}",
  "versionUrl": "https://.../s/YYYYMM/{pageId}/versions/1"
}
```

### Read Published Pages

```http
GET /s/YYYYMM/{pageId}
GET /s/YYYYMM/{pageId}/any/spa/path
GET /s/YYYYMM/{pageId}/versions/{version}
GET /s/YYYYMM/{pageId}/versions/{version}/any/spa/path
```

Latest URLs serve the current `publish/index.html`. Fixed-version URLs serve immutable historical `index.html` versions.

## HTML Requirements

- Send raw HTML bytes, not JSON, multipart form data, zip files, directories, or bundled asset folders.
- Use `Content-Type: text/html` or `text/html; charset=utf-8`.
- Body must be non-empty and start like an HTML document near the beginning, such as `<!doctype html>` or `<html>`.
- V1 stores one `index.html` only. Inline assets or reference externally hosted assets if the page needs CSS, JS, images, or fonts.

## Bash curl Client Pattern

Use environment variables for reusable values and secrets where possible.

- `BASE_URL`: service origin, for example `https://share.example.com`.
- `PUBLISH_TOKEN`: bearer token for creating pages.
- `UPDATE_TOKEN`: bearer token returned by the create response for later updates.
- `PERIOD`, `PAGE_ID`, and `VERSION`: values from API responses.

### Create From A File

```bash
curl -X POST "$BASE_URL/app" \
  -H "Authorization: Bearer $PUBLISH_TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary "@index.html"
```

### Update From A File

```bash
curl -X POST "$BASE_URL/app/$PERIOD/$PAGE_ID/versions" \
  -H "Authorization: Bearer $UPDATE_TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary "@index.html"
```

### Verify Publication

```bash
curl -i "$BASE_URL/s/$PERIOD/$PAGE_ID"
```

```bash
curl -i "$BASE_URL/s/$PERIOD/$PAGE_ID/versions/$VERSION"
```

## Response Handling

| Status | Meaning | Client action |
|---|---|---|
| 200 | Share URL served successfully | Verify expected HTML content if needed |
| 201 | Create or update succeeded | Store returned metadata securely |
| 400 | Invalid HTML body or max versions reached | Check HTML shape or version cap |
| 401 | Missing or invalid bearer token | Re-check token source and header |
| 404 | Unknown route, page, or version | Check `period`, `pageId`, version, and route shape |
| 413 | HTML body exceeds service limit | Reduce size or ask service owner about limit changes |
| 415 | Unsupported content type | Send raw HTML with `Content-Type: text/html` |
| 500 | Unexpected service error | Report generic failure and ask service owner to inspect logs |

## Final Response Pattern

After a successful publish/update, report:

- Latest share URL.
- Fixed version URL when available.
- Version number.
- Verification result from a real `GET` request.
- Update token only when the user explicitly needs it; mark it as secret.

Do not claim success until the share URL has been verified with an HTTP `GET` returning status 200.
