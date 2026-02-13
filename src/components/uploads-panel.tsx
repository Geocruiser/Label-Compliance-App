"use client";

import type { ChangeEvent } from "react";

type UploadsPanelProps = {
  fixtureOptions: Array<{
    id: string;
    formFileName: string;
    labelFileName: string;
  }>;
  selectedFixtureId: string;
  isFixtureLoading: boolean;
  fixtureError: string | null;
  handleFixtureSelection: (fixtureId: string) => void | Promise<void>;
  labelFileName: string | null;
  jsonFileName: string | null;
  jsonError: string | null;
  runError: string | null;
  isRunning: boolean;
  canRunVerification: boolean;
  handleLabelUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleJsonUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  handleRunVerification: () => void;
};

export const UploadsPanel = ({
  fixtureOptions,
  selectedFixtureId,
  isFixtureLoading,
  fixtureError,
  handleFixtureSelection,
  labelFileName,
  jsonFileName,
  jsonError,
  runError,
  isRunning,
  canRunVerification,
  handleLabelUpload,
  handleJsonUpload,
  handleRunVerification,
}: UploadsPanelProps) => {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Uploads</h2>

      <div className="mt-2 rounded-lg border border-slate-300 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="fixture-select"
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Demo Presets
          </label>
          <select
            id="fixture-select"
            aria-label="Select test fixture combination"
            disabled={isFixtureLoading}
            className="min-w-[220px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            value={selectedFixtureId}
            onChange={(event) => {
              void handleFixtureSelection(event.target.value);
            }}
          >
            <option value="">Select a label/form pair</option>
            {fixtureOptions.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.id} ({fixture.labelFileName} + {fixture.formFileName})
              </option>
            ))}
          </select>
        </div>
        {fixtureError && (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {fixtureError}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-2 rounded-lg border border-slate-300 p-2.5 text-sm text-slate-800">
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

        <label className="flex flex-col gap-2 rounded-lg border border-slate-300 p-2.5 text-sm text-slate-800">
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
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {jsonError}
        </p>
      )}

      {runError && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {runError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Run label verification"
          disabled={!canRunVerification || isRunning}
          onClick={handleRunVerification}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isRunning ? "Running Verification..." : "Run Verification"}
        </button>
      </div>
    </section>
  );
};
