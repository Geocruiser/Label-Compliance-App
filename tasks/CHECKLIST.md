# Project Checklist

## Milestone 1 - Foundation + Baseline Vertical Slice

- [x] Initialize Next.js + TypeScript + Tailwind scaffold
- [x] Add lint/typecheck scripts and core project config
- [x] Implement upload panel for label image and application JSON
- [x] Support PRD schema and legacy test-form schema parsing
- [x] Implement local OCR extraction with confidence + bounding boxes
- [x] Implement baseline core-field verification engine
- [x] Implement status outputs: Pass / Fail / Needs Review / Missing
- [x] Implement results table + evidence hover linkage
- [x] Implement label preview overlay and box filtering toggle
- [x] Update docs (`README.md`, `ARCHITECTURE.md`)

## Milestone 2 - Extraction Quality + Rule Precision

- [x] Standardize on OCR runtime path and remove unused client preprocessing
- [x] Add stronger class-specific verification logic
- [x] Add unit conversion and ABV/proof parsing normalization
- [x] Tighten government warning strict matching heuristics

## Milestone 3 - Compliance Coverage Hardening

- [x] Convert markdown rulesets into executable policy modules
- [x] Add required-vs-optional matrix by alcohol class
- [x] Create deterministic acceptance test suite on provided assets
- [x] Add regression fixtures for edge-case layouts

## Milestone 4 - Production Readiness

- [x] Add transient artifact cleanup workflow after each run
- [x] Tune performance and benchmark p95 latency
- [x] Add operator-facing error and confidence diagnostics
- [x] Prepare deployment documentation for internal rollout
