"use client";

import { useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import type {
  FieldKey,
  OcrCoordinateSpace,
  VerificationFieldResult,
} from "@/lib/types";

type LabelPreviewProps = {
  imageUrl: string | null;
  results: VerificationFieldResult[];
  selectedField: FieldKey | null;
  ocrCoordinateSpace: OcrCoordinateSpace | null;
};

type ImageDimensions = {
  width: number;
  height: number;
  imageUrl: string;
};

const getOverlayStyle = (
  status: VerificationFieldResult["status"],
  isFocused: boolean,
) => {
  const strokeWidth = isFocused ? 4.5 : 2.25;

  if (status === "Pass") {
    return {
      stroke: "rgb(16 185 129)",
      fill: isFocused ? "rgba(16, 185, 129, 0.24)" : "rgba(16, 185, 129, 0.12)",
      strokeWidth,
    };
  }

  if (status === "Fail") {
    return {
      stroke: "rgb(244 63 94)",
      fill: isFocused ? "rgba(244, 63, 94, 0.26)" : "rgba(244, 63, 94, 0.14)",
      strokeWidth,
    };
  }

  if (status === "Missing") {
    return {
      stroke: "rgb(100 116 139)",
      fill: isFocused ? "rgba(100, 116, 139, 0.24)" : "rgba(100, 116, 139, 0.12)",
      strokeWidth,
    };
  }

  return {
    stroke: "rgb(245 158 11)",
    fill: isFocused ? "rgba(245, 158, 11, 0.26)" : "rgba(245, 158, 11, 0.14)",
    strokeWidth,
  };
};

export const LabelPreview = ({
  imageUrl,
  results,
  selectedField,
  ocrCoordinateSpace,
}: LabelPreviewProps) => {
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(
    null,
  );

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const loadedImage = event.currentTarget;
    setImageDimensions({
      width: loadedImage.naturalWidth,
      height: loadedImage.naturalHeight,
      imageUrl: loadedImage.currentSrc || loadedImage.src,
    });
  };

  const renderedEvidenceBoxes = useMemo(() => {
    return results.filter((result) => result.evidenceBox !== null);
  }, [results]);

  const overlayDescription = "Evidence boxes selected by verification matching.";

  const overlayViewBox = useMemo(() => {
    if (
      ocrCoordinateSpace
      && ocrCoordinateSpace.width > 0
      && ocrCoordinateSpace.height > 0
    ) {
      return `${ocrCoordinateSpace.x} ${ocrCoordinateSpace.y} ${ocrCoordinateSpace.width} ${ocrCoordinateSpace.height}`;
    }

    if (
      imageUrl
      && imageDimensions
      && imageDimensions.imageUrl === imageUrl
      && imageDimensions.width > 0
      && imageDimensions.height > 0
    ) {
      return `0 0 ${imageDimensions.width} ${imageDimensions.height}`;
    }

    return null;
  }, [imageDimensions, imageUrl, ocrCoordinateSpace]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Label Preview</h2>
          <p className="mt-1 text-xs text-slate-600">
            {overlayDescription}
          </p>
        </div>
      </div>

      {!imageUrl ? (
        <div className="px-4 py-6 text-sm text-slate-600">
          Upload a label image to display verification evidence.
        </div>
      ) : (
        <div className="p-3">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
            {overlayViewBox ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt="Uploaded label preview"
                  className="block h-auto w-full"
                  onLoad={handleImageLoad}
                />
                <svg
                  aria-label="Evidence overlays"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={overlayViewBox}
                  preserveAspectRatio="none"
                >
                  {renderedEvidenceBoxes.map((result) => {
                    const isFocused = selectedField === result.field;
                    const style = getOverlayStyle(result.status, isFocused);

                    if (!result.evidenceBox) {
                      return null;
                    }

                    const boxX = result.evidenceBox.x0;
                    const boxY = result.evidenceBox.y0;
                    const boxWidth = Math.max(1, result.evidenceBox.x1 - result.evidenceBox.x0);
                    const boxHeight = Math.max(1, result.evidenceBox.y1 - result.evidenceBox.y0);

                    return (
                      <g key={result.field}>
                        {isFocused && (
                          <rect
                            x={boxX}
                            y={boxY}
                            width={boxWidth}
                            height={boxHeight}
                            stroke="rgba(15, 23, 42, 0.95)"
                            fill="transparent"
                            strokeWidth={style.strokeWidth + 2.5}
                            vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        )}
                        <rect
                          x={boxX}
                          y={boxY}
                          width={boxWidth}
                          height={boxHeight}
                          stroke={style.stroke}
                          fill={style.fill}
                          strokeWidth={style.strokeWidth}
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-slate-600">
                Loading image preview...
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Evidence: {renderedEvidenceBoxes.length}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
