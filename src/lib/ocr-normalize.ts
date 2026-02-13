import type {
  BoundingBox,
  OcrLine,
  OcrCoordinateSpace,
  OcrRunDiagnostics,
  OcrToken,
  PolygonPoint,
} from "@/lib/types";

type OcrResponseShape = {
  lines?: unknown[];
  tokens?: unknown[];
  coordinateSpace?: unknown;
  coordinate_space?: unknown;
  imageDimensions?: unknown;
  image_dimensions?: unknown;
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
  json?: unknown;
  chunks?: unknown;
  pages?: unknown;
  runtime?: unknown;
  status?: unknown;
  error?: unknown;
};

type MarkerLineCandidate = {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  polygon: PolygonPoint[] | null;
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

const isFiniteNumber = (value: number) => {
  return Number.isFinite(value);
};

const hasPositiveSize = (width: number, height: number) => {
  return width > 0 && height > 0;
};

const clampConfidence = (value: number) => {
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }

  return Math.max(0, Math.min(1, value));
};

const coercePolygon = (value: unknown): PolygonPoint[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        return { x: toNumber(point[0]), y: toNumber(point[1]) };
      }

      if (point && typeof point === "object") {
        const pointShape = point as Record<string, unknown>;
        const xValue = pointShape.x ?? pointShape.X;
        const yValue = pointShape.y ?? pointShape.Y;
        return { x: toNumber(xValue), y: toNumber(yValue) };
      }

      return null;
    })
    .filter((point): point is PolygonPoint => point !== null);

  return points.length >= 3 ? points : null;
};

const polygonToBoundingBox = (points: PolygonPoint[]): BoundingBox => {
  return points.reduce<BoundingBox>(
    (box, point) => ({
      x0: Math.min(box.x0, point.x),
      y0: Math.min(box.y0, point.y),
      x1: Math.max(box.x1, point.x),
      y1: Math.max(box.y1, point.y),
    }),
    {
      x0: points[0].x,
      y0: points[0].y,
      x1: points[0].x,
      y1: points[0].y,
    },
  );
};

const coerceBoundingBox = (value: unknown): BoundingBox => {
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((entry) => typeof entry !== "object")) {
      const [x0, y0, x1, y1] = value;
      return {
        x0: toNumber(x0),
        y0: toNumber(y0),
        x1: toNumber(x1),
        y1: toNumber(y1),
      };
    }

    const polygon = coercePolygon(value);
    if (polygon) {
      return polygonToBoundingBox(polygon);
    }
  }

  if (!value || typeof value !== "object") {
    return { x0: 0, y0: 0, x1: 0, y1: 0 };
  }

  const shape = value as Record<string, unknown>;
  return {
    x0: toNumber(shape.x0, toNumber(shape.left)),
    y0: toNumber(shape.y0, toNumber(shape.top)),
    x1: toNumber(shape.x1, toNumber(shape.right)),
    y1: toNumber(shape.y1, toNumber(shape.bottom)),
  };
};

const coerceCoordinateSpace = (
  value: unknown,
): OcrCoordinateSpace | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const shape = value as Record<string, unknown>;
  const x = toNumber(shape.x, toNumber(shape.x0, toNumber(shape.left, 0)));
  const y = toNumber(shape.y, toNumber(shape.y0, toNumber(shape.top, 0)));
  const width = toNumber(
    shape.width,
    toNumber(shape.w, toNumber(shape.x1, toNumber(shape.right))),
  );
  const height = toNumber(
    shape.height,
    toNumber(shape.h, toNumber(shape.y1, toNumber(shape.bottom))),
  );

  const usesRightEdgeForWidth =
    shape.width === undefined
    && shape.w === undefined
    && (shape.x1 !== undefined || shape.right !== undefined);
  const usesBottomEdgeForHeight =
    shape.height === undefined
    && shape.h === undefined
    && (shape.y1 !== undefined || shape.bottom !== undefined);
  const normalizedWidth =
    usesRightEdgeForWidth ? width - x : width;
  const normalizedHeight =
    usesBottomEdgeForHeight ? height - y : height;

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }

  if (!hasPositiveSize(normalizedWidth, normalizedHeight)) {
    return null;
  }

  return {
    x,
    y,
    width: normalizedWidth,
    height: normalizedHeight,
  };
};

const hasValidBoundingBox = (bbox: BoundingBox) => {
  return bbox.x1 > bbox.x0 && bbox.y1 > bbox.y0;
};

const boundingBoxToCoordinateSpace = (
  bbox: BoundingBox,
): OcrCoordinateSpace | null => {
  const width = bbox.x1 - bbox.x0;
  const height = bbox.y1 - bbox.y0;
  if (!hasPositiveSize(width, height)) {
    return null;
  }

  return {
    x: bbox.x0,
    y: bbox.y0,
    width,
    height,
  };
};

const getCoordinateSpaceFromBoxes = (boxes: BoundingBox[]) => {
  const validBoxes = boxes.filter((box) => hasValidBoundingBox(box));
  if (validBoxes.length === 0) {
    return null;
  }

  const combined = validBoxes.reduce<BoundingBox>(
    (bounds, box) => ({
      x0: Math.min(bounds.x0, box.x0),
      y0: Math.min(bounds.y0, box.y0),
      x1: Math.max(bounds.x1, box.x1),
      y1: Math.max(bounds.y1, box.y1),
    }),
    {
      x0: validBoxes[0].x0,
      y0: validBoxes[0].y0,
      x1: validBoxes[0].x1,
      y1: validBoxes[0].y1,
    },
  );

  return boundingBoxToCoordinateSpace(combined);
};

const coerceLine = (value: unknown): OcrLine | null => {
  const shape = (value ?? {}) as Record<string, unknown>;
  const text = toStringValue(shape.text).trim();
  if (text.length === 0) {
    return null;
  }

  const polygon = coercePolygon(shape.polygon);
  const bbox = hasValidBoundingBox(coerceBoundingBox(shape.bbox))
    ? coerceBoundingBox(shape.bbox)
    : polygon
      ? polygonToBoundingBox(polygon)
      : { x0: 0, y0: 0, x1: 0, y1: 0 };

  if (!hasValidBoundingBox(bbox)) {
    return null;
  }

  return {
    text,
    confidence: clampConfidence(toNumber(shape.confidence, 0.85)),
    bbox,
    polygon,
  };
};

const coerceToken = (value: unknown, index: number): OcrToken | null => {
  const shape = (value ?? {}) as Record<string, unknown>;
  const text = toStringValue(shape.text).trim();
  if (text.length === 0) {
    return null;
  }

  const bbox = coerceBoundingBox(shape.bbox);
  if (!hasValidBoundingBox(bbox)) {
    return null;
  }

  const lineIdRaw = shape.line_id ?? shape.lineId;
  return {
    text,
    confidence: clampConfidence(toNumber(shape.confidence, 0.85)),
    bbox,
    lineId: typeof lineIdRaw === "string" ? lineIdRaw : `line_${index}`,
  };
};

const splitTokensFromLine = (line: OcrLine, lineIndex: number): OcrToken[] => {
  const tokenMatches = Array.from(line.text.matchAll(/\S+/g));
  if (tokenMatches.length === 0) {
    return [];
  }

  const lineWidth = Math.max(1, line.bbox.x1 - line.bbox.x0);
  const lineUnits = Math.max(1, line.text.length);

  return tokenMatches.map((match, tokenIndex) => {
    const tokenText = match[0];
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + tokenText.length;

    let x0 = line.bbox.x0 + (lineWidth * (startIndex / lineUnits));
    let x1 = line.bbox.x0 + (lineWidth * (endIndex / lineUnits));
    if (tokenIndex === tokenMatches.length - 1) {
      x1 = line.bbox.x1;
    }

    x0 = Math.max(line.bbox.x0, Math.min(line.bbox.x1, x0));
    x1 = Math.max(x0, Math.min(line.bbox.x1, x1));

    return {
      text: tokenText,
      confidence: line.confidence,
      bbox: {
        x0,
        y0: line.bbox.y0,
        x1,
        y1: line.bbox.y1,
      },
      lineId: `line_${lineIndex}`,
    };
  });
};

const uniqueLinesByGeometry = (lines: MarkerLineCandidate[]) => {
  const unique = new Map<string, MarkerLineCandidate>();
  for (const line of lines) {
    const key = [
      line.text,
      Math.round(line.bbox.x0),
      Math.round(line.bbox.y0),
      Math.round(line.bbox.x1),
      Math.round(line.bbox.y1),
    ].join("|");
    if (!unique.has(key)) {
      unique.set(key, line);
    }
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftY = (left.bbox.y0 + left.bbox.y1) / 2;
    const rightY = (right.bbox.y0 + right.bbox.y1) / 2;
    if (Math.abs(leftY - rightY) <= 6) {
      const leftX = (left.bbox.x0 + left.bbox.x1) / 2;
      const rightX = (right.bbox.x0 + right.bbox.x1) / 2;
      return leftX - rightX;
    }
    return leftY - rightY;
  });
};

const getObjectBoundingBox = (shape: Record<string, unknown>): BoundingBox | null => {
  const bboxCandidates = [
    shape.bbox,
    shape.box,
    shape.bounds,
    shape.boundingBox,
    shape.bounding_box,
  ];
  for (const candidate of bboxCandidates) {
    const bbox = coerceBoundingBox(candidate);
    if (hasValidBoundingBox(bbox)) {
      return bbox;
    }
  }

  const polygonCandidates = [shape.polygon, shape.points];
  for (const candidate of polygonCandidates) {
    const polygon = coercePolygon(candidate);
    if (polygon) {
      return polygonToBoundingBox(polygon);
    }
  }

  return null;
};

const getObjectPolygon = (shape: Record<string, unknown>) => {
  const polygonCandidates = [shape.polygon, shape.points];
  for (const candidate of polygonCandidates) {
    const polygon = coercePolygon(candidate);
    if (polygon) {
      return polygon;
    }
  }

  return null;
};

const decodeHtmlEntities = (value: string) => {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
};

const stripHtmlToText = (value: string) => {
  const stripped = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(stripped).replace(/\s+/g, " ").trim();
};

const stripMarkdownImageSyntax = (value: string) => {
  return value
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/!\[[^\]]*]\[[^\]]*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeBlockType = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.toLowerCase().replace(/[\s_-]+/g, "");
};

const isNonTextBlockType = (value: unknown) => {
  const normalized = normalizeBlockType(value);
  const excludedTypes = new Set([
    "page",
    "image",
    "picture",
    "figure",
    "graphic",
    "illustration",
    "logo",
    "seal",
    "stamp",
    "table",
    "tableofcontents",
    "caption",
    "figurecaption",
    "imagecaption",
    "photocaption",
  ]);
  return excludedTypes.has(normalized);
};

const getObjectText = (shape: Record<string, unknown>): string => {
  const keys = ["text", "raw_text", "line_text", "value", "content"];
  for (const key of keys) {
    const text = toStringValue(shape[key]).trim();
    if (text.length > 0) {
      return text.replace(/\s+/g, " ").trim();
    }
  }

  const markdownValue = stripMarkdownImageSyntax(toStringValue(shape.markdown));
  if (markdownValue.length > 0) {
    return markdownValue;
  }

  const htmlValue = toStringValue(shape.html).trim();
  if (htmlValue.length > 0) {
    return stripHtmlToText(htmlValue);
  }

  return "";
};

const isLikelyImageDescriptionText = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  const descriptionPatterns = [
    /^(image|photo|picture|illustration|graphic|figure|logo)\s*[:\-]/,
    /^(an?|the|this)\s+(image|photo|picture|illustration|graphic|label)\s+(shows|depicts|features)\b/,
    /^(an?\s+)?close[- ]up\s+of\b/,
  ];

  return descriptionPatterns.some((pattern) => pattern.test(normalized));
};

const getObjectConfidence = (shape: Record<string, unknown>) => {
  return clampConfidence(
    toNumber(shape.confidence, toNumber(shape.score, toNumber(shape.probability, 0.85))),
  );
};

const collectMarkerLineCandidates = (
  value: unknown,
  results: MarkerLineCandidate[],
  pageCandidates: BoundingBox[],
  visited: WeakSet<object>,
) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMarkerLineCandidates(item, results, pageCandidates, visited);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  const shape = value as Record<string, unknown>;
  const blockType = toStringValue(shape.block_type).toLowerCase();
  if (blockType === "page") {
    const pageBounds = getObjectBoundingBox(shape);
    if (pageBounds && hasValidBoundingBox(pageBounds)) {
      pageCandidates.push(pageBounds);
    }
  }

  const skipAsTextCandidate = isNonTextBlockType(shape.block_type);
  const text = getObjectText(shape);
  const bbox = getObjectBoundingBox(shape);
  const skipAsImageryNarration = isLikelyImageDescriptionText(text);
  if (
    !skipAsTextCandidate &&
    !skipAsImageryNarration &&
    text.length > 0 &&
    bbox &&
    hasValidBoundingBox(bbox)
  ) {
    results.push({
      text,
      confidence: getObjectConfidence(shape),
      bbox,
      polygon: getObjectPolygon(shape),
    });
  }

  for (const nestedValue of Object.values(shape)) {
    if (!nestedValue || typeof nestedValue !== "object") {
      continue;
    }
    collectMarkerLineCandidates(nestedValue, results, pageCandidates, visited);
  }
};

const getLargestBoundingBox = (boxes: BoundingBox[]) => {
  if (boxes.length === 0) {
    return null;
  }

  return boxes.reduce<BoundingBox>((largest, current) => {
    const largestArea = (largest.x1 - largest.x0) * (largest.y1 - largest.y0);
    const currentArea = (current.x1 - current.x0) * (current.y1 - current.y0);
    return currentArea > largestArea ? current : largest;
  }, boxes[0]);
};

const extractMarkerPayloadDetails = (payload: OcrResponseShape) => {
  const sourceCandidates = [payload.json, payload.chunks, payload.pages, payload];
  const markerCandidates: MarkerLineCandidate[] = [];
  const pageCandidates: BoundingBox[] = [];
  const visited = new WeakSet<object>();

  for (const source of sourceCandidates) {
    collectMarkerLineCandidates(source, markerCandidates, pageCandidates, visited);
  }

  const lines = uniqueLinesByGeometry(markerCandidates).map((candidate) => ({
    text: candidate.text,
    confidence: candidate.confidence,
    bbox: candidate.bbox,
    polygon: candidate.polygon,
  }));

  const largestPageBox = getLargestBoundingBox(pageCandidates);
  return {
    lines,
    coordinateSpace: largestPageBox
      ? boundingBoxToCoordinateSpace(largestPageBox)
      : null,
  };
};

const getWarnings = (payload: OcrResponseShape) => {
  const warningsFromDiagnostics = payload.diagnostics?.warnings;
  if (
    Array.isArray(warningsFromDiagnostics) &&
    warningsFromDiagnostics.every((warning) => typeof warning === "string")
  ) {
    return [...warningsFromDiagnostics] as string[];
  }

  return [];
};

const getTransientArtifacts = (payload: OcrResponseShape) => {
  const artifacts = payload.diagnostics?.transientArtifactsCleared;
  if (!Array.isArray(artifacts)) {
    return [];
  }

  return artifacts
    .filter((artifact) => typeof artifact === "string")
    .map((artifact) => artifact as string);
};

const toRoundedCount = (primary: unknown, fallback: unknown, defaultValue: number) => {
  return Math.round(toNumber(primary, toNumber(fallback, defaultValue)));
};

const getExplicitCoordinateSpace = (payload: OcrResponseShape) => {
  const diagnosticsShape = payload.diagnostics as Record<string, unknown> | undefined;
  return (
    coerceCoordinateSpace(payload.coordinateSpace)
    ?? coerceCoordinateSpace(payload.coordinate_space)
    ?? coerceCoordinateSpace(payload.imageDimensions)
    ?? coerceCoordinateSpace(payload.image_dimensions)
    ?? coerceCoordinateSpace(diagnosticsShape?.coordinateSpace)
    ?? coerceCoordinateSpace(diagnosticsShape?.coordinate_space)
  );
};

export type NormalizedOcrResult = {
  lines: OcrLine[];
  tokens: OcrToken[];
  coordinateSpace: OcrCoordinateSpace | null;
  diagnostics: OcrRunDiagnostics;
};

export const normalizeOcrResponse = (payload: unknown): NormalizedOcrResult => {
  const response = (payload ?? {}) as OcrResponseShape;

  const directLines = (response.lines ?? [])
    .map((line) => coerceLine(line))
    .filter((line): line is OcrLine => line !== null);
  const markerExtraction = extractMarkerPayloadDetails(response);
  const lines = directLines.length > 0 ? directLines : markerExtraction.lines;

  const directTokens = (response.tokens ?? [])
    .map((token, index) => coerceToken(token, index))
    .filter((token): token is OcrToken => token !== null);
  const tokens =
    directTokens.length > 0
      ? directTokens
      : lines.flatMap((line, lineIndex) => splitTokensFromLine(line, lineIndex));
  const inferredCoordinateSpace = getCoordinateSpaceFromBoxes([
    ...lines.map((line) => line.bbox),
    ...tokens.map((token) => token.bbox),
  ]);
  const coordinateSpace =
    getExplicitCoordinateSpace(response)
    ?? markerExtraction.coordinateSpace
    ?? inferredCoordinateSpace;

  const warnings = getWarnings(response);
  const errorMessage = toStringValue(response.error).trim();
  if (errorMessage.length > 0) {
    warnings.push(`OCR provider error payload: ${errorMessage}`);
  }

  const statusValue = toStringValue(response.status).trim();
  if (statusValue.length > 0 && statusValue !== "complete") {
    warnings.push(`OCR provider status: ${statusValue}`);
  }

  if (lines.length === 0) {
    warnings.push("OCR provider returned zero text lines.");
  }

  return {
    lines,
    tokens,
    coordinateSpace,
    diagnostics: {
      totalOcrMs: Math.round(toNumber(response.diagnostics?.totalOcrMs, toNumber(response.runtime, 0))),
      lineCount: toRoundedCount(
        response.diagnostics?.lineCount,
        response.diagnostics?.line_count,
        lines.length,
      ),
      tokenCount: toRoundedCount(
        response.diagnostics?.tokenCount,
        response.diagnostics?.token_count,
        tokens.length,
      ),
      cleanupApplied: Boolean(response.diagnostics?.cleanupApplied),
      transientArtifactsCleared: getTransientArtifacts(response),
      warnings,
      model: toStringValue(response.diagnostics?.model) || "datalab_marker",
      inferenceMs: Math.round(
        toNumber(
          response.diagnostics?.inference_ms,
          toNumber(response.diagnostics?.inferenceMs, toNumber(response.runtime, 0)),
        ),
      ),
      apiRoundTripMs: Math.round(toNumber(response.diagnostics?.apiRoundTripMs, 0)),
    },
  };
};
