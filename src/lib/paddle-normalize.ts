import type {
  BoundingBox,
  OcrLine,
  OcrRunDiagnostics,
  OcrToken,
  PolygonPoint,
} from "@/lib/types";

type PaddleResponseShape = {
  lines?: unknown[];
  tokens?: unknown[];
  diagnostics?: {
    model?: unknown;
    inference_ms?: unknown;
    inferenceMs?: unknown;
    apiRoundTripMs?: unknown;
    totalOcrMs?: unknown;
    lineCount?: unknown;
    line_count?: unknown;
    tokenCount?: unknown;
    token_count?: unknown;
    cleanupApplied?: unknown;
    transientArtifactsCleared?: unknown;
    warnings?: unknown;
  };
};

const toNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const toStringValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  return "";
};

const coerceBoundingBox = (value: unknown): BoundingBox => {
  if (!value || typeof value !== "object") {
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  }

  const shape = value as Record<string, unknown>;
  return {
    x0: toNumber(shape.x0),
    y0: toNumber(shape.y0),
    x1: toNumber(shape.x1),
    y1: toNumber(shape.y1),
  };
};

const coercePolygon = (value: unknown): PolygonPoint[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) {
        return null;
      }

      return {
        x: toNumber(point[0]),
        y: toNumber(point[1]),
      };
    })
    .filter((point): point is PolygonPoint => point !== null);

  return points.length >= 3 ? points : null;
};

const clampConfidence = (value: number) => {
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
};

const coerceLine = (value: unknown): OcrLine => {
  const shape = (value ?? {}) as Record<string, unknown>;
  return {
    text: toStringValue(shape.text).trim(),
    confidence: clampConfidence(toNumber(shape.confidence)),
    bbox: coerceBoundingBox(shape.bbox),
    polygon: coercePolygon(shape.polygon),
  };
};

const coerceToken = (value: unknown, index: number): OcrToken => {
  const shape = (value ?? {}) as Record<string, unknown>;
  const lineIdRaw = shape.line_id ?? shape.lineId;
  return {
    text: toStringValue(shape.text).trim(),
    confidence: clampConfidence(toNumber(shape.confidence)),
    bbox: coerceBoundingBox(shape.bbox),
    lineId: typeof lineIdRaw === "string" ? lineIdRaw : `line_${index}`,
  };
};

export type NormalizedPaddleOcrResult = {
  lines: OcrLine[];
  tokens: OcrToken[];
  diagnostics: OcrRunDiagnostics;
};

export const normalizePaddleOcrResponse = (
  payload: unknown,
): NormalizedPaddleOcrResult => {
  const response = (payload ?? {}) as PaddleResponseShape;
  const lines = (response.lines ?? [])
    .map((line) => coerceLine(line))
    .filter((line) => line.text.length > 0);
  const tokens = (response.tokens ?? [])
    .map((token, index) => coerceToken(token, index))
    .filter((token) => token.text.length > 0);

  const warnings =
    Array.isArray(response.diagnostics?.warnings) &&
    response.diagnostics?.warnings.every((warning) => typeof warning === "string")
      ? (response.diagnostics?.warnings as string[])
      : [];
  const transientArtifactsCleared = Array.isArray(
    response.diagnostics?.transientArtifactsCleared,
  )
    ? (response.diagnostics?.transientArtifactsCleared as unknown[])
        .filter((value) => typeof value === "string")
        .map((value) => value as string)
    : [];

  return {
    lines,
    tokens,
    diagnostics: {
      totalOcrMs: 0,
      lineCount: Math.round(
        toNumber(
          response.diagnostics?.lineCount,
          toNumber(response.diagnostics?.line_count, lines.length),
        ),
      ),
      tokenCount: Math.round(
        toNumber(
          response.diagnostics?.tokenCount,
          toNumber(response.diagnostics?.token_count, tokens.length),
        ),
      ),
      cleanupApplied: Boolean(response.diagnostics?.cleanupApplied),
      transientArtifactsCleared,
      warnings,
      model: toStringValue(response.diagnostics?.model) || "paddleocr",
      inferenceMs: Math.round(
        toNumber(response.diagnostics?.inference_ms, toNumber(response.diagnostics?.inferenceMs)),
      ),
      apiRoundTripMs: Math.round(toNumber(response.diagnostics?.apiRoundTripMs, 0)),
    },
  };
};
