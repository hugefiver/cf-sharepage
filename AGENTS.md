# Project Agent Instructions

This file is for agent-facing rules only. Product background, route details, and storage rationale live in [`PROJECT_ARCHITECTURE.md`](PROJECT_ARCHITECTURE.md). Read that document before changing behavior, storage layout, API contracts, or deployment configuration.

## Non-Negotiable Product Constraints

- R2 is the only durable storage layer for the MVP.
- The first version (v1) accepts one raw `index.html` upload per page version. Multi-file SPA bundles, zip uploads, and asset extraction are deferred.
- Store per-page state in `manifest.json` objects in R2.
- Keep latest public content under `pages/YYYYMM/{pageId}/publish/`.
- Store immutable historical versions under `pages/YYYYMM/{pageId}/versions/{n}/`.
- Generate public `pageId` and private `updateToken` independently with cryptographic randomness.
- Store only an HMAC digest of update tokens in manifests.
- Do not derive public `pageId` values from update tokens.
- Do not add user accounts, billing, analytics, KV, D1, Pages, or external services unless the user explicitly changes scope.

## Stack Rules

- Use pnpm for package management and scripts.
- Use TypeScript for all source and tests.
- Use Vite with the Cloudflare Vite plugin for local development and builds.
- Use Wrangler for Cloudflare deployment, local Worker testing, and R2 bindings.
- Prefer current/latest package versions unless a compatibility issue requires pinning.

## Development Rules

- Use PowerShell-compatible commands in plans and documentation.
- Do not install dependencies unless the user explicitly approves installation.
- Do not commit unless the user explicitly asks.
- Keep generated planning artifacts out of git unless the user asks to track them.
- Add tests for implementation work and run `pnpm test` plus `pnpm typecheck` before claiming completion.
