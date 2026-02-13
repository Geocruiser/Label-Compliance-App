# Approach, Tools, Assumptions, and Trade-offs

## Approach

- Build a single-label verification workflow optimized for TTB agent review speed and clarity.
- Use OCR extraction plus deterministic, class-aware matching rules to compare label content to application JSON.
- Return field-level outcomes (`Pass`, `Fail`, `Needs Review`, `Missing`) with evidence boxes to support explainability.
- Favor conservative decisions: uncertain cases should route to `Needs Review` rather than false `Pass`.
- Keep data transient per session with cleanup after each verification run.

## Tools

- **Frontend/App**: Next.js + React + TypeScript + Tailwind CSS.
- **OCR Integration**: Datalab Marker via `src/app/api/ocr/route.ts`, normalized in `src/lib/ocr-normalize.ts`.
- **Verification Engine**: parser- and policy-based matching in `src/lib/verification.ts`, `src/lib/value-parsers.ts`, and `src/lib/policy/*`.
- **Quality and Validation**: ESLint, TypeScript checks, unit/regression/acceptance tests, and deterministic p95 benchmarking.
- **Runtime Modes**: `demo` mode (fixture-based) and `api` mode (live OCR) for deployment flexibility.

## Assumptions

- A human reviewer is always in the loop for final compliance decisions.
- Unclear on worker input so assume they are one label image plus one application JSON per run.
- OCR quality may vary by layout/image quality; policy is to degrade to `Needs Review`/`Missing` safely.
- Class-specific requirements (wine/beer/distilled/import contexts) drive whether fields are required, conditional, or optional.
- The system is deployed where server-side secrets (for OCR provider access) can be protected.

## Trade-offs

- **Conservative matching vs automation rate**: fewer false approvals, but more `Needs Review` outcomes.
- **OCR model selection (Tesseract/PaddleOCR vs Marker)**: local OCR gave stronger deployment control, while Marker reduced OCR engineering overhead for MVP delivery.
- **Tesseract**: easy to run locally and no external API dependency, but inconsistent on complex/varied label typography without substantial preprocessing and tuning.
- **PaddleOCR**: stronger detection/recognition than baseline local OCR in many cases, but still required pipeline tuning and environment management for stable production-like behavior.
- **Rule-based transparency vs broad generalization**: easier auditing and policy traceability, but less robust to novel layouts/text patterns.
- **Marker**: best extraction consistency and fastest integration for this app, but adds hosted-service dependency, credential management, and cost/network sensitivity.
- **Static demo compatibility vs full-stack realism**: GitHub Pages demo is easy to share, but only `api` mode represents real OCR behavior.

