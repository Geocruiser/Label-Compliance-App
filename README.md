# Label Compliance App

Standalone TTB label verification app for single-label review workflows.

## PRD Source

- Active product definition used for this scaffold: `docs/LABEL_VERIFICATION_APP.md`
- The repository does not currently include `LABEL_VERIFICATION_APP_PRD.md`; the implementation below maps to the existing PRD file.

## Milestone 1 (Implemented)

Milestone 1 delivers a working local-first vertical slice:

- Next.js + TypeScript + Tailwind scaffold
- Single-screen upload flow (label image + application JSON)
- JSON schema parsing and validation:
  - PRD schema (`application_id`, `alcohol_class`, nested `fields`)
  - Legacy test form schema in `assets/Test Forms/*.json`
- Local OCR pipeline (client-side `tesseract.js`)
- Baseline field verification engine with conservative thresholds
- Results table with required statuses:
  - `Pass`
  - `Fail`
  - `Needs Review`
  - `Missing`
- Evidence bounding-box overlays with row hover/focus highlighting
- Basic run telemetry (start/end/duration, OCR line count)

## Milestone 2 (Implemented)

Milestone 2 improves extraction quality and rule precision:

- OCR preprocessing pipeline:
  - grayscale conversion
  - denoise (3x3 box blur)
  - contrast stretch
  - adaptive thresholding
  - orientation auto-rotation (90/180/270 when detected)
- Dual OCR pass strategy:
  - preprocessed recognition
  - raw recognition fallback
  - quality-based selection between both outputs
- Class-aware verification requirements:
  - distilled spirits alcohol content treated as required
  - wine alcohol content missing values routed to review
  - beer alcohol-content handling remains conditional
  - import-sensitive name/address and country checks
- Parser-based normalization:
  - ABV/proof parsing and normalized comparison tolerances
  - net-contents parsing with metric/us-customary conversion to mL
  - class-aware net-unit preference checks
- Government warning strictness upgrades:
  - uppercase prefix enforcement
  - clause marker checks (`(1)`, `(2)`)
  - stricter exact-match gate for `Pass`
  - high-confidence mismatch handling

## Milestone 3 (Implemented)

Milestone 3 adds compliance hardening and deterministic verification fixtures:

- Executable policy modules converted from markdown rulesets:
  - distilled spirits rules
  - wine rules
  - malt beverage rules
  - generic fallback policy
- Required-vs-optional matrix by alcohol class with runtime overrides:
  - import-sensitive requirements for `country_of_origin` and `name_address`
  - conditional handling for beer/other alcohol-content statements
- Deterministic acceptance suite on provided assets:
  - validates all `assets/Test Forms/test*_form.json`
  - checks corresponding label file presence in `assets/Test Labels/`
  - runs status assertions against stable OCR fixture lines
- Regression fixtures for edge-case layouts:
  - warning prefix casing issues
  - high-confidence warning wording mismatches
  - cross-unit net-content edge case
  - high-confidence alcohol mismatch case

## Milestone 4 (Implemented)

Milestone 4 introduces production-readiness controls and operator telemetry:

- Transient artifact cleanup workflow:
  - OCR worker and intermediate image blobs are cleared after each run
  - upload artifacts are cleared from memory after run completion
  - operator can manually clear all session artifacts from the UI
- Runtime benchmarking:
  - deterministic p95 benchmark script for verification core
  - session-level p95 tracking in the diagnostics panel
- Operator-facing diagnostics:
  - status distribution + low-confidence field list
  - OCR stage timings and pipeline selection diagnostics
  - structured error stage/timestamp diagnostics
  - cleanup event visibility and transient artifact trace
- Internal deployment documentation:
  - `docs/DEPLOYMENT.md` with install/build/start/security guidance

## Quick Start

1. Install dependencies:
   - `npm install`
2. Start development server:
   - `npm run dev`
3. Open:
   - `http://localhost:3000`

## Usage

1. Upload one label image (`.png`, `.jpg`, `.jpeg`, `.webp`).
2. Upload one application JSON file.
3. Click `Run Verification`.
4. Review:
   - Per-field result statuses
   - Application vs extracted values
   - Evidence boxes on the preview image

## Key Files

- `src/components/verification-workbench.tsx` - Milestone 1 orchestrator UI
- `src/lib/schemas.ts` - JSON schema parsing + canonical model conversion
- `src/lib/ocr.ts` - local OCR runner
- `src/lib/image-preprocess.ts` - OCR image preprocessing and rotation utilities
- `src/lib/value-parsers.ts` - ABV/proof and net-contents parsers
- `src/lib/class-rules.ts` - class-aware requirement and unit policies
- `src/lib/policy/rulesets.ts` - executable policy rule definitions from docs
- `src/lib/policy/requirement-matrix.ts` - required/conditional/optional matrix logic
- `src/lib/verification.ts` - class-aware field matching and strict warning checks
- `src/components/operator-diagnostics.tsx` - operator metrics/error/confidence dashboard
- `src/lib/performance.ts` - percentile/p95 utilities
- `docs/required-field-matrix.md` - human-readable matrix tied to executable policy
- `docs/DEPLOYMENT.md` - internal deployment and operations runbook
- `tests/acceptance/verification-acceptance.test.ts` - deterministic acceptance suite
- `tests/regression/layout-regression.test.ts` - edge-case regression fixtures
- `scripts/benchmark-p95.ts` - deterministic p95 benchmark runner
- `ARCHITECTURE.md` - architecture, folder structure, and milestone plan
- `tasks/CHECKLIST.md` - implementation checklist and milestone tracker

## Verification Commands

- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Tests: `npm run test`
- Acceptance tests only: `npm run test:acceptance`
- Benchmark p95: `npm run benchmark:p95`
- Combined: `npm run check`