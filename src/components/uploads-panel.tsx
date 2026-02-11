"use client";

import type { ChangeEvent } from "react";

type UploadsPanelProps = {
  labelFileName: string | null;
  jsonFileName: string | null;
  jsonError: string | null;
  runError: string | null;
  cleanupNote: string | null;
  isRunning: boolean;
  canRunVerification: boolean;
  ocrProgressPercent: number | null;
  handleLabelUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleJsonUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleRunVerification: () => void;
  handleClearSession: () => void;
};

export const UploadsPanel = ({
  labelFileName,
  jsonFileName,
  jsonError,
  runError,
  cleanupNote,
  isRunning,
  canRunVerification,
  ocrProgressPercent,
  handleLabelUpload,
  handleJsonUpload,
  handleRunVerification,
  handleClearSession,
}: UploadsPanelProps) => {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Uploads</h2>
      <p className="mt-1 text-xs text-slate-600">
        Milestone 1 supports both PRD schema and provided legacy test-form JSON.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-2 rounded-lg border border-slate-300 p-3 text-sm text-slate-800">
          <span className="font-medium">Label image (.png/.jpg/.jpeg)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            aria-label="Upload label image file"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-700"
            onChange={handleLabelUpload}
          />
          <span className="text-xs text-slate-500">
            {labelFileName ? `Selected: ${labelFileName}` : "No file selected"}
          </span>
        </label>

        <label className="flex flex-col gap-2 rounded-lg border border-slate-300 p-3 text-sm text-slate-800">
          <span className="font-medium">Application JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Upload application JSON file"
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-700"
            onChange={handleJsonUpload}
          />
          <span className="text-xs text-slate-500">
            {jsonFileName ? `Selected: ${jsonFileName}` : "No file selected"}
          </span>
        </label>
      </div>

      {jsonError && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {jsonError}
        </p>
      )}

      {runError && (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {runError}
        </p>
      )}

      {cleanupNote && (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {cleanupNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="Run label verification"
          disabled={!canRunVerification || isRunning}
          onClick={handleRunVerification}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isRunning ? "Running Verification..." : "Run Verification"}
        </button>

        {isRunning && (
          <span className="text-xs text-slate-600">
            OCR progress:{" "}
            {ocrProgressPercent === null ? "starting..." : `${ocrProgressPercent}%`}
          </span>
        )}

        <button
          type="button"
          aria-label="Clear transient session artifacts"
          onClick={handleClearSession}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear Session Artifacts
        </button>
      </div>
    </section>
  );
};
