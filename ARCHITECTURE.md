# Label Verification App Architecture

## Scope Alignment

This architecture is based on `docs/LABEL_VERIFICATION_APP.md` (the PRD available in this repository).

## System Architecture (Milestone Plan Oriented)

### Client Application (Next.js)

- Single-page operator workflow:
  - upload label image
  - upload application JSON
  - run verification
  - inspect field-level outcomes + evidence
- Core responsibilities:
  - manage local UI state
  - parse/validate input JSON
  - run local OCR
  - execute baseline matching rules
  - render explainability overlays

### Domain Layer

- `class-rules.ts`
  - class-aware policy orchestration and unit preference profile
  - requirement resolution wrapper APIs
- `policy/rulesets.ts`
  - executable policy modules converted from markdown rulesets
  - field-to-rule mapping for rule-aware verification reasons
- `policy/requirement-matrix.ts`
  - required/conditional/optional matrix by alcohol class
  - import-aware requirement overrides
- `docs/required-field-matrix.md`
  - human-readable matrix synced to executable matrix behavior
- `tests/acceptance/verification-acceptance.test.ts`
  - deterministic acceptance checks using provided forms and label asset presence
- `tests/regression/layout-regression.test.ts`
  - regression fixtures for edge-case layouts and strictness boundaries
- `tests/unit/policy-modules.test.ts`
  - unit validation for policy matrix and ruleset availability
- `tests/fixtures/*.ts`
  - deterministic OCR fixture payloads and expected status maps
- `value-parsers.ts`
  - normalized parsers for ABV/proof and net contents
  - conversion helpers for cross-unit comparison
- `performance.ts`
  - p50/p95 percentile and duration summary utilities
- `schemas.ts`
  - validates input payloads
  - supports both PRD and legacy test-form schemas
  - maps to one canonical internal model
- `verification.ts`
  - field-level matching with parser-based normalization
  - class-aware matching and requirement logic
  - strict government warning validation heuristics
- `operator-diagnostics.tsx`
  - operator-facing confidence/error/runtime diagnostics panel

### OCR Layer

- `ocr.ts`
  - local OCR via `tesseract.js` with dual-pass quality selection
  - orientation detection and right-angle auto-rotation
  - extracts OCR lines with confidence + bounding boxes
  - no outbound cloud ML API dependency
- `image-preprocess.ts`
  - local preprocessing (grayscale, denoise, contrast, thresholding)
  - canvas-based image transformation utilities

## Folder Structure

```text
.
├── ARCHITECTURE.md
├── README.md
├── scripts/
│   ├── benchmark-p95.ts
│   └── README.md
├── tasks/
│   └── CHECKLIST.md
├── docs/
│   ├── DEPLOYMENT.md
│   ├── LABEL_VERIFICATION_APP.md
│   ├── required-field-matrix.md
│   └── rulesets/
├── assets/
│   ├── Test Forms/
│   └── Test Labels/
├── tests/
│   ├── acceptance/
│   ├── fixtures/
│   ├── regression/
│   └── unit/
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   ├── label-preview.tsx
    │   ├── operator-diagnostics.tsx
    │   ├── results-table.tsx
    │   ├── status-badge.tsx
    │   ├── uploads-panel.tsx
    │   └── verification-workbench.tsx
    └── lib/
        ├── class-rules.ts
        ├── constants.ts
        ├── image-preprocess.ts
        ├── normalization.ts
        ├── ocr.ts
        ├── policy/
        ├── performance.ts
        ├── schemas.ts
        ├── types.ts
        ├── value-parsers.ts
        └── verification.ts
```

## Milestone Plan

### Milestone 1 - Foundation + Baseline Vertical Slice (Implemented)

- App scaffold (Next.js, TypeScript, Tailwind, linting)
- Upload UI and run action
- JSON schema validation + canonical mapping
- Local OCR pipeline and OCR confidence capture
- Baseline verifier for core fields
- Results table with status taxonomy
- Label preview with evidence boxes and hover/focus linking

### Milestone 2 - Extraction Quality + Rule Precision (Implemented)

- OCR preprocessing with denoise/contrast/thresholding pipeline
- Orientation auto-rotation and dual-pass OCR quality selection
- Class-aware matching profiles (wine/beer/distilled)
- Unit normalization and ABV/proof parser-driven comparisons
- Stricter warning validation heuristics and confidence-based outcomes

### Milestone 3 - Compliance Coverage Hardening (Implemented)

- Converted draft rulesets in `docs/rulesets/` into executable policy modules
- Added explicit required-vs-optional matrix with class/import-aware overrides
- Added deterministic acceptance suite for `assets/Test Labels` + `assets/Test Forms`
- Added regression fixtures and regression tests for edge-case layouts

### Milestone 4 - Production Readiness (Implemented)

- Session artifact cleanup workflow after each run
- Deterministic p95 benchmark script + in-session p95 tracking
- Operator-facing diagnostics for confidence/runtime/error visibility
- Internal deployment runbook for rollout and operations
