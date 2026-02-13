"use client";

import type { BatchDecision } from "@/lib/types";

type ReviewControlsPanelProps = {
  decision: BatchDecision;
  canApproveOrDeny: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  canJumpToFirstUndecided: boolean;
  canDownloadJson: boolean;
  handleApprove: () => void;
  handleDeny: () => void;
  handlePreviousLabel: () => void;
  handleNextLabel: () => void;
  handleJumpToFirstUndecided: () => void;
  handleDownloadJson: () => void;
};

export const ReviewControlsPanel = ({
  decision,
  canApproveOrDeny,
  canGoPrevious,
  canGoNext,
  canJumpToFirstUndecided,
  canDownloadJson,
  handleApprove,
  handleDeny,
  handlePreviousLabel,
  handleNextLabel,
  handleJumpToFirstUndecided,
  handleDownloadJson,
}: ReviewControlsPanelProps) => {
  return (
    <aside className="self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4">
      <p className="text-center text-xs text-slate-700">
        Decision: <strong className="font-semibold text-slate-900">{decision}</strong>
      </p>

      <div className="mt-4 flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Approve current label decision"
            disabled={!canApproveOrDeny}
            onClick={handleApprove}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300 ${
              decision === "approve"
                ? "bg-emerald-700 ring-2 ring-emerald-300"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            Approve
          </button>
          <button
            type="button"
            aria-label="Deny current label decision"
            disabled={!canApproveOrDeny}
            onClick={handleDeny}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300 ${
              decision === "deny"
                ? "bg-rose-700 ring-2 ring-rose-300"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            Deny
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Go to previous label in batch"
            disabled={!canGoPrevious}
            onClick={handlePreviousLabel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous Label
          </button>
          <button
            type="button"
            aria-label="Go to next label in batch"
            disabled={!canGoNext}
            onClick={handleNextLabel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next Label
          </button>
        </div>

        <button
          type="button"
          aria-label="Jump to first undecided label in batch"
          disabled={!canJumpToFirstUndecided}
          onClick={handleJumpToFirstUndecided}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          First Undecided
        </button>

        <button
          type="button"
          aria-label="Download batch decisions JSON"
          disabled={!canDownloadJson}
          onClick={handleDownloadJson}
          className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download Summary JSON
        </button>
      </div>
    </aside>
  );
};
