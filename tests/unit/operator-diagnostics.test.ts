import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatorDiagnostics } from "@/components/operator-diagnostics";
import type { VerificationResult } from "@/lib/types";

const buildVerificationResult = (): VerificationResult => {
  return {
    fields: [
      {
        field: "brand_name",
        label: "Brand Name",
        applicationValue: "AMALFI COAST",
        extractedValue: "AMALFI",
        status: "Needs Review",
        confidence: 0.72,
        reason: "Close match below strict threshold.",
        evidenceBox: { x0: 80, y0: 200, x1: 420, y1: 320 },
        evidenceSource: "word",
        evidenceTokenCount: 2,
        evidenceOversized: false,
      },
    ],
    ocrLines: [],
    ocrTokens: [],
    ocrCoordinateSpace: null,
    ocrDiagnostics: {
      totalOcrMs: 420,
      lineCount: 12,
      tokenCount: 44,
      model: "datalab_marker",
      inferenceMs: 215,
      apiRoundTripMs: 305,
      cleanupApplied: true,
      transientArtifactsCleared: ["browser_form_data", "api_response_payload"],
      warnings: [],
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.420Z",
    durationMs: 420,
  };
};

describe("operator diagnostics", () => {
  it("renders OCR diagnostics without legacy pipeline fields", () => {
    const html = renderToStaticMarkup(
      createElement(OperatorDiagnostics, {
        verificationResult: buildVerificationResult(),
        runDurationsMs: [420],
        lastError: null,
      }),
    );

    expect(html).toContain("OCR line count: 12");
    expect(html).toContain("OCR token count: 44");
    expect(html).not.toContain("Selected pipeline");
    expect(html).not.toContain("Preprocess steps");
  });

  it("shows None for warnings and cleared artifacts when empty", () => {
    const verificationResult = buildVerificationResult();
    verificationResult.ocrDiagnostics.transientArtifactsCleared = [];
    verificationResult.ocrDiagnostics.warnings = [];

    const html = renderToStaticMarkup(
      createElement(OperatorDiagnostics, {
        verificationResult,
        runDurationsMs: [420],
        lastError: null,
      }),
    );

    expect(html).toContain("Cleared transient artifacts: None");
    expect(html).toContain("Warnings: None");
  });
});
