# Project Agent Instructions

## Project Direction

Build a Cloudflare Worker + R2-only SPA sharing service. The first version (v1) accepts one raw `index.html` file upload per version. Multi-file SPA bundle/asset upload is deferred. R2 stores HTML documents and their manifests. The service avoids KV, D1, Cloudflare Pages, and external databases.

## Stack

- Use pnpm for package management and scripts.
- Use TypeScript for all source and tests.
- Use Vite with the Cloudflare Vite plugin for local development and builds.
- Use Wrangler for Cloudflare deployment and R2 bindings.
- Prefer current/latest package versions unless a compatibility issue requires pinning.

## Architecture Constraints

- R2 is the only durable storage layer for the MVP.
- Store per-page state in `manifest.json` objects in R2.
- Keep the latest public content under `pages/YYYYMM/{pageId}/publish/`.
- Store immutable historical versions under `pages/YYYYMM/{pageId}/versions/{n}/`.
- Do not derive public `pageId` values from update tokens.
- Generate public `pageId` and private `updateToken` independently with cryptographic randomness.
- Store only an HMAC digest of update tokens in manifests.
- Do not add user accounts, billing, analytics, KV, D1, Pages, or external services unless the user explicitly changes scope.
- The first version (v1) stores a single `index.html` document per page version under `publish/` and `versions/{n}/`. Multi-file SPA bundles and asset extraction are deferred.

## Development Rules

- Use PowerShell-compatible commands in plans and documentation.
- Do not install dependencies unless the user explicitly approves installation.
- Do not commit unless the user explicitly asks.
- Keep generated planning artifacts out of git unless the user asks to track them.
- Add tests for implementation work and run `pnpm test` plus `pnpm typecheck` before claiming completion.
