"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  FieldKey,
  OcrLine,
  OcrToken,
  PolygonPoint,
  VerificationFieldResult,
} from "@/lib/types";

type LabelPreviewProps = {
  imageUrl: string | null;
  results: VerificationFieldResult[];
  selectedField: FieldKey | null;
  ocrLines: OcrLine[];
  ocrTokens: OcrToken[];
};

type ImageDimensions = {
  width: number;
  height: number;
};

type OverlayMode = "evidence" | "ocr_lines" | "ocr_tokens" | "compare";

const getOverlayStyle = (
  status: VerificationFieldResult["status"],
  isFocused: boolean,
) => {
  const strokeWidth = isFocused ? 3 : 2;

  if (status === "Pass") {
    return {
      stroke: "rgb(16 185 129)",
      fill: "rgba(16, 185, 129, 0.12)",
      strokeWidth,
    };
  }

  if (status === "Fail") {
    return {
      stroke: "rgb(244 63 94)",
      fill: "rgba(244, 63, 94, 0.14)",
      strokeWidth,
    };
  }

  if (status === "Missing") {
    return {
      stroke: "rgb(100 116 139)",
      fill: "rgba(100, 116, 139, 0.12)",
      strokeWidth,
    };
  }

  return {
    stroke: "rgb(245 158 11)",
    fill: "rgba(245, 158, 11, 0.14)",
    strokeWidth,
  };
};

const toSvgPolygonPoints = (points: PolygonPoint[]) => {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
};

export const LabelPreview = ({
  imageUrl,
  results,
  selectedField,
  ocrLines,
  ocrTokens,
}: LabelPreviewProps) => {
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(
    null,
  );
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("evidence");

  const renderedEvidenceBoxes = useMemo(() => {
    const rowsWithEvidence = results.filter((result) => result.evidenceBox !== null);

    if (!showSelectedOnly || !selectedField) {
      return rowsWithEvidence;
    }

    return rowsWithEvidence.filter((result) => result.field === selectedField);
  }, [results, selectedField, showSelectedOnly]);

  const renderedLineBoxes = useMemo(() => {
    return ocrLines.filter((line) => {
      const hasPolygon = Array.isArray(line.polygon) && line.polygon.length >= 3;
      const hasBox = line.bbox.x1 > line.bbox.x0 && line.bbox.y1 > line.bbox.y0;
      return hasPolygon || hasBox;
    });
  }, [ocrLines]);

  const renderedTokenBoxes = useMemo(() => {
    return ocrTokens.filter(
      (token) => token.bbox.x1 > token.bbox.x0 && token.bbox.y1 > token.bbox.y0,
    );
  }, [ocrTokens]);

  const showEvidenceLayer = overlayMode === "evidence" || overlayMode === "compare";
  const showLinesLayer = overlayMode === "ocr_lines" || overlayMode === "compare";
  const showTokensLayer = overlayMode === "ocr_tokens" || overlayMode === "compare";
  const selectedOnlyDisabled = !showEvidenceLayer;

  const overlayDescription =
    overlayMode === "evidence"
      ? "Evidence boxes selected by verification matching."
      : overlayMode === "ocr_lines"
        ? "Raw OCR line boxes returned by PaddleOCR."
        : overlayMode === "ocr_tokens"
          ? "Raw OCR token boxes after token splitting."
          : "Compare evidence boxes against raw OCR line and token boxes.";

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      setImageDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.src = imageUrl;
  }, [imageUrl]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Label Preview</h2>
          <p className="mt-1 text-xs text-slate-600">
            {overlayDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="overlay-mode"
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Overlay mode
          </label>
          <select
            id="overlay-mode"
            aria-label="Select overlay diagnostics mode"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            value={overlayMode}
            onChange={(event) => setOverlayMode(event.target.value as OverlayMode)}
          >
            <option value="evidence">Evidence</option>
            <option value="ocr_lines">OCR lines</option>
            <option value="ocr_tokens">OCR tokens</option>
            <option value="compare">Compare all</option>
          </select>
          <button
            type="button"
            aria-label="Toggle selected evidence boxes"
            disabled={selectedOnlyDisabled}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            onClick={() => setShowSelectedOnly((current) => !current)}
          >
            {showSelectedOnly ? "Show all evidence" : "Show selected evidence"}
          </button>
        </div>
      </div>

      {!imageUrl ? (
        <div className="grid min-h-[420px] place-items-center px-4 py-6 text-sm text-slate-600">
          Upload a label image to display OCR evidence overlay.
        </div>
      ) : (
        <div className="p-4">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
            {imageDimensions ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Uploaded label preview"
                  className="block h-auto w-full"
                />
                <svg
                  aria-label="Evidence overlays"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                  preserveAspectRatio="none"
                >
                  {showLinesLayer &&
                    renderedLineBoxes.map((line, index) => {
                      const polygonPoints = line.polygon ?? [];
                      const hasPolygon = polygonPoints.length >= 3;
                      if (hasPolygon) {
                        return (
                          <polygon
                            key={`ocr-line-poly-${index}`}
                            points={toSvgPolygonPoints(polygonPoints)}
                            stroke="rgb(37 99 235)"
                            fill="rgba(37, 99, 235, 0.05)"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        );
                      }

                      return (
                        <rect
                          key={`ocr-line-rect-${index}`}
                          x={line.bbox.x0}
                          y={line.bbox.y0}
                          width={Math.max(1, line.bbox.x1 - line.bbox.x0)}
                          height={Math.max(1, line.bbox.y1 - line.bbox.y0)}
                          stroke="rgb(37 99 235)"
                          fill="rgba(37, 99, 235, 0.05)"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                          pointerEvents="none"
                        />
                      );
                    })}
                  {showTokensLayer &&
                    renderedTokenBoxes.map((token, index) => (
                      <rect
                        key={`ocr-token-${index}`}
                        x={token.bbox.x0}
                        y={token.bbox.y0}
                        width={Math.max(1, token.bbox.x1 - token.bbox.x0)}
                        height={Math.max(1, token.bbox.y1 - token.bbox.y0)}
                        stroke="rgb(124 58 237)"
                        fill="rgba(124, 58, 237, 0.05)"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    ))}
                  {showEvidenceLayer &&
                    renderedEvidenceBoxes.map((result) => {
                      const isFocused = selectedField === result.field;
                      const style = getOverlayStyle(result.status, isFocused);

                      if (!result.evidenceBox) {
                        return null;
                      }

                      return (
                        <rect
                          key={result.field}
                          x={result.evidenceBox.x0}
                          y={result.evidenceBox.y0}
                          width={Math.max(1, result.evidenceBox.x1 - result.evidenceBox.x0)}
                          height={Math.max(1, result.evidenceBox.y1 - result.evidenceBox.y0)}
                          stroke={style.stroke}
                          fill={style.fill}
                          strokeWidth={style.strokeWidth}
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                </svg>
              </div>
            ) : (
              <div className="grid min-h-[420px] place-items-center px-4 py-6 text-sm text-slate-600">
                Loading image preview...
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            {showEvidenceLayer && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Evidence: {renderedEvidenceBoxes.length}
              </span>
            )}
            {showLinesLayer && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-600" />
                OCR lines: {renderedLineBoxes.length}
              </span>
            )}
            {showTokensLayer && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-violet-600" />
                OCR tokens: {renderedTokenBoxes.length}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
