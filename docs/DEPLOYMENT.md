# Deployment Guide (Internal)

This deployment now uses a Dockerized PaddleOCR backend service and a Next.js frontend.

## 1) Runtime Requirements

- Node.js 20+
- npm 10+
- Docker Engine with Compose plugin

## 2) Components

- Next.js app (UI + verification + OCR proxy route)
- PaddleOCR service container (`services/paddle-ocr`)

## 3) Environment Variables

- `OCR_SERVICE_URL` (optional)
  - Default: `http://localhost:8001/ocr`
  - Set this if OCR service runs on a different host/port

## 4) Local/Server Startup Sequence

1. Install dependencies:

```bash
npm install
```

2. Start OCR service:

```bash
npm run ocr:up
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

Stop OCR service:

```bash
npm run ocr:down
```

## 5) Security and Network Notes

- Place both services behind internal reverse proxy/TLS.
- Restrict app and OCR service to internal network access.
- Avoid exposing OCR container directly to public networks.
- Enforce authentication/authorization at gateway/app layer.

## 6) Data Handling and Retention

- Upload payloads are proxied to OCR service and processed transiently.
- Session cleanup is applied after each verification run.
- Operators can manually clear artifacts in the UI.
- Avoid attaching external analytics to raw OCR payloads.

## 7) Troubleshooting

- OCR route returns 500:
  - Confirm OCR container is up (`docker ps`).
  - Check OCR health: `GET http://localhost:8001/health`.
  - Verify `OCR_SERVICE_URL` matches reachable endpoint.
- OCR returns no lines:
  - Inspect OCR service logs and diagnostics warnings in app UI.
  - Validate image format support and payload size.

## 8) Operational Validation Checklist

- `npm run check` passes.
- `npm run build` succeeds.
- `npm run benchmark:p95` reviewed.
- Manual run on `test4.png` and `test8.png` succeeds.
- Operator diagnostics show Paddle model timings and token/line counts.
