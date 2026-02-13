# Deployment Guide (Internal)

This deployment now uses Datalab Hosted Marker API for OCR with a Next.js frontend.

## 1) Runtime Requirements

- Node.js 20+
- npm 10+

## 2) Components

- Next.js app (UI + verification + Datalab OCR proxy route)

## 3) Environment Variables

- `DATALAB_API_KEY` (required)
  - Datalab API key used by `src/app/api/ocr/route.ts`
- `DATALAB_BASE_URL` (optional)
  - Default: `https://www.datalab.to`
- `DATALAB_MARKER_MODE` (optional)
  - Default: `balanced`
  - Allowed values: `fast`, `balanced`, `accurate`

## 4) Local/Server Startup Sequence

1. Install dependencies:

```bash
npm install
```

2. Run checks and build:

```bash
npm run check
npm run build
```

3. Start app:

```bash
npm run start
```

Default app port is `3000`. Override if needed:

```bash
PORT=8080 npm run start
```

## 5) Security and Network Notes

- Place app traffic behind internal reverse proxy/TLS.
- Restrict server-side access to Datalab credentials.
- Do not expose `DATALAB_API_KEY` to browser code.
- Enforce authentication/authorization at gateway/app layer.

## 6) Data Handling and Retention

- Upload payloads are proxied to Datalab Marker and processed transiently.
- Session cleanup is applied after each verification run.
- Operators can manually clear artifacts in the UI.
- Avoid attaching external analytics to raw OCR payloads.

## 7) Troubleshooting

- OCR route returns 500:
  - Verify `DATALAB_API_KEY` is configured on the app host.
  - Confirm outbound network access to `https://www.datalab.to`.
  - Validate Datalab account status/rate limits.
- OCR returns no lines:
  - Inspect OCR route logs and diagnostics warnings in app UI.
  - Validate image format support and payload size.

## 8) Operational Validation Checklist

- `npm run check` passes.
- `npm run build` succeeds.
- `npm run benchmark:p95` reviewed.
- Manual run on `test4.png` and `test8.png` succeeds.
- Operator diagnostics show Datalab model timings and token/line counts.
