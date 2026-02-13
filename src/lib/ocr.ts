import { normalizeOcrResponse } from "@/lib/ocr-normalize";
import { isDemoMode } from "@/lib/app-mode";
import { loadDemoOcrPayloadForLabel } from "@/lib/demo-fixtures";
import type {
  OcrCoordinateSpace,
  OcrLine,
  OcrRunDiagnostics,
  OcrToken,
} from "@/lib/types";

type OcrProgressHandler = (percent: number) => void;
type OcrRunResult = {
  lines: OcrLine[];
  tokens: OcrToken[];
  coordinateSpace: OcrCoordinateSpace | null;
  diagnostics: OcrRunDiagnostics;
};

export const runLocalOcr = async (
  imageFile: File,
  handleProgress?: OcrProgressHandler,
): Promise<OcrRunResult> => {
  if (isDemoMode) {
    handleProgress?.(0.1);
    const startedAt = performance.now();
    const demoPayload = await loadDemoOcrPayloadForLabel(imageFile.name);
    handleProgress?.(0.85);

    const normalized = normalizeOcrResponse(demoPayload);
    normalized.diagnostics.apiRoundTripMs = normalized.diagnostics.apiRoundTripMs
      ? normalized.diagnostics.apiRoundTripMs
      : Math.round(performance.now() - startedAt);
    normalized.diagnostics.totalOcrMs = Math.round(performance.now() - startedAt);
    normalized.diagnostics.cleanupApplied = true;
    normalized.diagnostics.transientArtifactsCleared = [
      "browser_form_data",
      "demo_fixture_payload",
    ];
    normalized.diagnostics.warnings = [
      ...normalized.diagnostics.warnings,
      "Demo mode enabled: OCR payload loaded from pre-generated fixture data.",
    ];

    if (normalized.lines.length === 0) {
      normalized.diagnostics.warnings.push(
        "OCR provider returned zero lines for this image.",
      );
    }

    handleProgress?.(1);
    return normalized;
  }

  const formData = new FormData();
  formData.append("image", imageFile);

  handleProgress?.(0.1);
  const startedAt = performance.now();

  const response = await fetch("/api/ocr", {
    method: "POST",
    body: formData,
  });
  handleProgress?.(0.85);

  const payload = await response.json();
  if (!response.ok) {
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : "OCR request failed.";
    throw new Error(message);
  }

  const normalized = normalizeOcrResponse(payload);
  normalized.diagnostics.apiRoundTripMs = normalized.diagnostics.apiRoundTripMs
    ? normalized.diagnostics.apiRoundTripMs
    : Math.round(performance.now() - startedAt);
  normalized.diagnostics.totalOcrMs = Math.round(performance.now() - startedAt);
  normalized.diagnostics.cleanupApplied = true;
  normalized.diagnostics.transientArtifactsCleared = [
    "browser_form_data",
    "api_response_payload",
  ];

  if (normalized.lines.length === 0) {
    normalized.diagnostics.warnings.push(
      "OCR provider returned zero lines for this image.",
    );
  }

  handleProgress?.(1);
  return normalized;
};
