# Deployment Guide (Internal)

This deployment supports two modes:

- Full app mode (`NEXT_PUBLIC_APP_MODE=api`) with Datalab OCR via server API route
- Frontend demo mode (`NEXT_PUBLIC_APP_MODE=demo`) with pre-generated fixture responses

## 1) Runtime Requirements

- Node.js 20+
- npm 10+


## 2) Components

- Next.js app (UI + verification + Datalab OCR proxy route)

## 3) Environment Variables

- `NEXT_PUBLIC_APP_MODE` (optional)
  - `demo` (default): use pre-generated fixture data, no server OCR route calls
  - `api`: call real Next API routes (`/api/ocr`, `/api/test-fixtures`)
- `DATALAB_API_KEY` (required)
  - Datalab API key used by `src/app/api/ocr/route.ts`
- `DATALAB_BASE_URL` (optional)
  - Default: `https://www.datalab.to`
- `DATALAB_MARKER_MODE` (optional)
  - Default: `balanced`
  - Allowed values: `fast`, `balanced`, `accurate`

## 4) Local/Server Startup Sequence (Real API Mode)

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
NEXT_PUBLIC_APP_MODE=api
DATALAB_API_KEY=<your_key>
```

3. Run checks and build:

```bash
npm run check
npm run build
```

4. Start app:

```bash
npm run start
```

Default app port is `3000`. Override if needed:

```bash
PORT=8080 npm run start
```

## 5) GitHub Pages PoC (Frontend Demo Only)

This repo includes `.github/workflows/deploy-pages.yml` for static Pages deploy.

- Build command: `npm run build:pages`
- Build helper: `scripts/build-pages.mjs`
- Behavior:
  - Sets `GITHUB_PAGES=true` for static export/basePath config
  - Sets `NEXT_PUBLIC_APP_MODE=demo`
  - Temporarily moves `src/app/api` out of the app tree during export build
  - Deploys `out/` artifact to GitHub Pages

Reviewers can still clone locally and run real API mode by setting `NEXT_PUBLIC_APP_MODE=api` and their own Datalab key.

## 6) Security and Network Notes

- Place app traffic behind internal reverse proxy/TLS.
- Restrict server-side access to Datalab credentials.
- Do not expose `DATALAB_API_KEY` to browser code.
- Enforce authentication/authorization at gateway/app layer.

## 7) Data Handling and Retention

- Upload payloads are proxied to Datalab Marker and processed transiently.
- Session cleanup is applied after each verification run.
- Operators can manually clear artifacts in the UI.
- Avoid attaching external analytics to raw OCR payloads.

## 8) Troubleshooting

- OCR route returns 500:
  - Verify `DATALAB_API_KEY` is configured on the app host.
  - Confirm outbound network access to `https://www.datalab.to`.
  - Validate Datalab account status/rate limits.
- OCR returns no lines:
  - Inspect OCR route logs and diagnostics warnings in app UI.
  - Validate image format support and payload size.

## 9) Operational Validation Checklist

- `npm run check` passes.
- `npm run build` succeeds.
- `npm run benchmark:p95` reviewed.
- Manual run on `test4.png` and `test8.png` succeeds.
- Operator diagnostics show Datalab model timings and token/line counts.
