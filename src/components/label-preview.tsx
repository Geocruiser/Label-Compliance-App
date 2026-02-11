"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import type { FieldKey, VerificationFieldResult } from "@/lib/types";

type LabelPreviewProps = {
  imageUrl: string | null;
  results: VerificationFieldResult[];
  selectedField: FieldKey | null;
};

type ImageDimensions = {
  width: number;
  height: number;
};

const getBoxClasses = (status: VerificationFieldResult["status"]) => {
  if (status === "Pass") {
    return "border-emerald-500 bg-emerald-200/15";
  }

  if (status === "Fail") {
    return "border-rose-500 bg-rose-200/20";
  }

  if (status === "Missing") {
    return "border-slate-500 bg-slate-200/15";
  }

  return "border-amber-500 bg-amber-200/20";
};

export const LabelPreview = ({
  imageUrl,
  results,
  selectedField,
}: LabelPreviewProps) => {
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(
    null,
  );
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  const renderedBoxes = useMemo(() => {
    const rowsWithEvidence = results.filter((result) => result.evidenceBox !== null);

    if (!showSelectedOnly || !selectedField) {
      return rowsWithEvidence;
    }

    return rowsWithEvidence.filter((result) => result.field === selectedField);
  }, [results, selectedField, showSelectedOnly]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Label Preview</h2>
          <p className="mt-1 text-xs text-slate-600">
            Bounding boxes come from OCR lines selected as evidence.
          </p>
        </div>
        <button
          type="button"
          aria-label="Toggle selected evidence boxes"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          onClick={() => setShowSelectedOnly((current) => !current)}
        >
          {showSelectedOnly ? "Show all boxes" : "Show selected only"}
        </button>
      </div>

      {!imageUrl ? (
        <div className="grid min-h-[420px] place-items-center px-4 py-6 text-sm text-slate-600">
          Upload a label image to display OCR evidence overlay.
        </div>
      ) : (
        <div className="p-4">
          <div className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
            <img
              src={imageUrl}
              alt="Uploaded alcohol label"
              className="h-auto w-full object-contain"
              onLoad={(event) => {
                const targetImage = event.currentTarget;
                setImageDimensions({
                  width: targetImage.naturalWidth,
                  height: targetImage.naturalHeight,
                });
              }}
            />

            {imageDimensions &&
              renderedBoxes.map((result) => {
                if (!result.evidenceBox) {
                  return null;
                }

                const widthPercent =
                  ((result.evidenceBox.x1 - result.evidenceBox.x0) /
                    imageDimensions.width) *
                  100;
                const heightPercent =
                  ((result.evidenceBox.y1 - result.evidenceBox.y0) /
                    imageDimensions.height) *
                  100;
                const leftPercent =
                  (result.evidenceBox.x0 / imageDimensions.width) * 100;
                const topPercent =
                  (result.evidenceBox.y0 / imageDimensions.height) * 100;
                const isFocused = selectedField === result.field;

                return (
                  <div
                    key={result.field}
                    aria-label={`Evidence box for ${result.label}`}
                    className={`pointer-events-none absolute border-2 ${getBoxClasses(result.status)} ${
                      isFocused ? "ring-2 ring-indigo-500 ring-offset-1" : ""
                    }`}
                    style={{
                      left: `${leftPercent}%`,
                      top: `${topPercent}%`,
                      width: `${widthPercent}%`,
                      height: `${heightPercent}%`,
                    }}
                  />
                );
              })}
          </div>
        </div>
      )}
    </section>
  );
};
