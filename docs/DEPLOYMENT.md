# Deployment Guide (Internal)

This app is designed for standalone internal deployment without outbound cloud ML dependencies.

## 1) Runtime Requirements

- Node.js 20+
- npm 10+
- Modern browser with WebAssembly support (for local OCR)

## 2) Install and Build

```bash
npm install
npm run check
npm run build
```

Optional performance benchmark:

```bash
npm run benchmark:p95
```

## 3) Start in Production

```bash
npm run start
```

Default port is `3000`. Override with:

```bash
PORT=8080 npm run start
```

## 4) Internal Network Deployment Notes

- Place the app behind internal reverse proxy/TLS.
- Restrict access to authenticated internal users.
- Prefer deployment in a network segment with no public ingress.
- Do not expose the server directly to the public internet.

## 5) Data Handling and Retention

- OCR and verification processing is local/session-scoped.
- Uploaded transient artifacts are cleared after each verification run.
- Operators can manually clear all session artifacts via the UI.
- Do not configure external analytics for sensitive payload capture.

## 6) Operational Validation Checklist

- `npm run check` passes in deployment image
- `npm run build` succeeds
- `npm run benchmark:p95` reviewed
- sample upload/verification works in production environment
- operator diagnostics panel displays p95, confidence, and error telemetry
