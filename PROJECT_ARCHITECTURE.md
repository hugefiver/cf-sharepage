# Project Architecture

## Purpose

`cf-sharepage` is a Cloudflare Worker + R2 service for sharing and versioning single-file HTML SPAs. The MVP prioritizes a free-tier-friendly architecture with explicit limits and no external database.

## Current MVP Scope

- Accept one raw `index.html` document per page version.
- Create a public share URL on first upload.
- Return a private update token on first upload.
- Allow later uploads to append immutable versions under the same page path.
- Serve the latest version by default and fixed versions by explicit version URL.
- Keep all durable state in Cloudflare R2.

Deferred work:

- Multi-file SPA bundle upload.
- Zip upload and asset extraction.
- User accounts, teams, billing, analytics, and dashboards.
- Cloudflare Pages deployment per publish.
- KV, D1, or external database integration.

## Stack

- pnpm for package management and scripts.
- TypeScript for source and tests.
- Vite with the Cloudflare Vite plugin for local development and builds.
- Wrangler for local Worker testing, deployment, and R2 bindings.
- Vitest with the Cloudflare Workers test pool for Worker-compatible tests.

## Storage Layout

All persistent data lives in R2 under `pages/YYYYMM/{pageId}/`.

```text
pages/YYYYMM/{pageId}/manifest.json
pages/YYYYMM/{pageId}/publish/index.html
pages/YYYYMM/{pageId}/versions/0/index.html
pages/YYYYMM/{pageId}/versions/1/index.html
```

- `manifest.json` stores page metadata, version history, the latest version number, and the update-token HMAC digest.
- `publish/index.html` is the mutable latest alias used by latest share routes.
- `versions/{n}/index.html` contains immutable historical versions.
- R2 has no filesystem hard links, so `publish/index.html` and `versions/{n}/index.html` are duplicate objects by design.

## Identifier And Token Model

- `pageId` is public and generated with cryptographic randomness.
- `updateToken` is private and generated independently from `pageId`.
- The raw update token is returned once and never stored.
- Manifests store only `HMAC-SHA-256(UPDATE_TOKEN_SECRET, pageId + ":" + updateToken)`.
- Update requests submit the update token with `Authorization: Bearer <updateToken>`.

## API Shape

- `POST /app`: create a page from raw `text/html` content. Requires `Authorization: Bearer <publish token>`.
- `POST /app/YYYYMM/{pageId}/versions`: append a new page version. Requires `Authorization: Bearer <updateToken>`.
- `GET /SKILL.md`: serve this instance's API client skill with the current origin filled into curl examples.
- `GET /s/YYYYMM/{pageId}`: serve latest `publish/index.html`.
- `GET /s/YYYYMM/{pageId}/...`: latest-version SPA fallback to `publish/index.html`.
- `GET /s/YYYYMM/{pageId}/versions/{version}`: serve immutable `versions/{version}/index.html`.
- `GET /s/YYYYMM/{pageId}/versions/{version}/...`: fixed-version SPA fallback to that version's `index.html`.

## Cache Strategy

- Latest routes read from `publish/index.html` and bypass Worker Cache API to avoid stale updates.
- Fixed-version routes are immutable and can use cache-first serving.
- Fixed-version fallback paths share the resolved `versions/{n}/index.html` cache key instead of caching one copy per public path.

## Operational Notes

- Use explicit size and version limits to stay within free-tier expectations.
- GitHub Actions must sync `PUBLISH_TOKEN` and `UPDATE_TOKEN_SECRET` as Worker runtime secrets before deployment.
- Local Wrangler E2E can run with `wrangler dev --local` and injected `--var` test secrets.
