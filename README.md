# cf-sharepage

A pnpm + TypeScript + Vite Cloudflare Worker + R2 service for sharing single-file HTML SPAs.

## Overview

cf-sharepage provides a simple way to host and version raw HTML documents. Version 1 (v1) accepts one raw `index.html` upload per version. Multi-file SPA bundles, zip uploads, and asset extraction are deferred to future versions.

The service uses Cloudflare R2 as its only storage layer. It avoids KV, D1, Cloudflare Pages, and external databases.

## Architecture

- R2 Bucket: `cf-sharepage-spa`
- Storage Layout:
  - `pages/YYYYMM/{pageId}/manifest.json`: Stores page state and version history.
  - `pages/YYYYMM/{pageId}/publish/index.html`: The latest public content.
  - `pages/YYYYMM/{pageId}/versions/{n}/index.html`: Immutable historical versions.
- Security:
  - `pageId` and `updateToken` are generated independently with cryptographic randomness.
  - Manifests store only an HMAC digest of the `updateToken`.
  - Update tokens are never stored in plain text.

## API Routes

- `POST /app`: Create a new page. Requires `Authorization: Bearer <publish token>`.
- `POST /app/YYYYMM/{pageId}/versions`: Update an existing page. Requires `Authorization: Bearer <updateToken>`.
- `GET /SKILL.md`: Serve this instance's API client skill with the current origin filled into curl examples.
- `GET /s/YYYYMM/{pageId}`: Serve the latest version.
- `GET /s/YYYYMM/{pageId}/...`: Latest-version SPA fallback. V1 serves `index.html` for all paths.
- `GET /s/YYYYMM/{pageId}/versions/{version}`: Serve a specific version.
- `GET /s/YYYYMM/{pageId}/versions/{version}/...`: Fixed-version SPA fallback. V1 serves that version's `index.html` for all paths.

## Local Development

### Prerequisites

- Node 22+
- Corepack enabled

### Setup

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

### Development and Testing

```powershell
# Run tests
pnpm test

# Run type checks
pnpm typecheck

# Start local development server
pnpm dev
```

### Environment Variables (.dev.vars)

Create a `.dev.vars` file in the project root for local development:

```
PUBLISH_TOKEN="your-publish-token-here"
UPDATE_TOKEN_SECRET="your-update-token-secret-here"
```

## Deployment

### Cloudflare Setup

1. Create an R2 bucket named `cf-sharepage-spa`:

```powershell
pnpm exec wrangler r2 bucket create cf-sharepage-spa
```

1. Set the Worker runtime secrets:

```powershell
pnpm exec wrangler secret put PUBLISH_TOKEN
pnpm exec wrangler secret put UPDATE_TOKEN_SECRET
```

1. Configure Cloudflare's Git integration for this repository:

- Repository: `hugefiver/cf-sharepage`
- Branch: `master`
- Root directory: `/`
- Build command: `pnpm build`
- Deploy command, if Cloudflare asks for one separately: `pnpm exec wrangler deploy`

1. Push to `master` to let Cloudflare receive the repository hook and build the Worker.

### Cloudflare Git Integration

Deployment is handled by Cloudflare's Git integration, not by GitHub Actions. Configure runtime settings in the Cloudflare Worker dashboard:

- R2 binding: `SPA_BUCKET` -> `cf-sharepage-spa`
- Variables: `MAX_HTML_BYTES=5242880`, `MAX_VERSIONS=20`
- Secrets: `PUBLISH_TOKEN`, `UPDATE_TOKEN_SECRET`

The archived `.github/workflows/deploy.yml` file is kept only as a reference. Its extension prevents GitHub Actions from running deployment on push.

## Usage Examples (PowerShell)

### Create a new page

```powershell
Invoke-WebRequest -Uri "https://your-worker.workers.dev/app" `
    -Method Post `
    -Headers @{ "Authorization" = "Bearer <publish token>" } `
    -ContentType "text/html" `
    -InFile ".\index.html"
```

### Update an existing page

```powershell
Invoke-WebRequest -Uri "https://your-worker.workers.dev/app/202606/{pageId}/versions" `
    -Method Post `
    -Headers @{ "Authorization" = "Bearer <updateToken>" } `
    -ContentType "text/html" `
    -InFile ".\index.html"
```

### Using curl.exe

```powershell
& "curl.exe" -X POST "https://your-worker.workers.dev/app" `
    -H "Authorization: Bearer <publish token>" `
    -H "Content-Type: text/html" `
    --data-binary "@index.html"
```
