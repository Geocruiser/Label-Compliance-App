import { summarizeDurations } from "@/lib/performance";
import type { VerificationResult } from "@/lib/types";

type OperatorError = {
  stage: "json_parse" | "verification_run";
  message: string;
  timestamp: string;
};

type OperatorDiagnosticsProps = {
  verificationResult: VerificationResult | null;
  runDurationsMs: number[];
  lastError: OperatorError | null;
};

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) {
    return "N/A";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
};

const formatPercent = (value: number | null) => {
  if (value === null) {
    return "N/A";
  }

  return `${Math.round(value * 100)}%`;
};

export const OperatorDiagnostics = ({
  verificationResult,
  runDurationsMs,
  lastError,
}: OperatorDiagnosticsProps) => {
  const benchmarkSummary = summarizeDurations(runDurationsMs);
  const statusCounts =
    verificationResult?.fields.reduce<Record<string, number>>((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {}) ?? {};

  const confidenceValues =
    verificationResult?.fields
      .map((result) => result.confidence)
      .filter((confidence): confidence is number => confidence !== null) ?? [];
  const averageFieldConfidence =
    confidenceValues.length > 0
      ? confidenceValues.reduce((total, current) => total + current, 0) /
        confidenceValues.length
      : null;
  const lowConfidenceFields =
    verificationResult?.fields
      .filter((result) => result.confidence !== null && result.confidence < 0.65)
      .map((result) => result.label) ?? [];
  const evidenceSourceCounts =
    verificationResult?.fields.reduce(
      (counts, result) => {
        const source = result.evidenceSource ?? "none";
        counts[source] += 1;
        return counts;
      },
      { word: 0, line: 0, none: 0 },
    ) ?? { word: 0, line: 0, none: 0 };
  const oversizedFields =
    verificationResult?.fields
      .filter((result) => Boolean(result.evidenceOversized))
      .map((result) => result.label) ?? [];
  const averageEvidenceTokens =
    verificationResult && verificationResult.fields.length > 0
      ? verificationResult.fields.reduce((total, result) => {
          return total + (result.evidenceTokenCount ?? 0);
        }, 0) / verificationResult.fields.length
      : null;

  const targetP95Ms = 5000;
  const p95PassesTarget =
    benchmarkSummary.p95Ms !== null && benchmarkSummary.p95Ms <= targetP95Ms;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Operator Diagnostics</h2>
      <p className="mt-1 text-xs text-slate-600">
        Session diagnostics for confidence, errors, cleanup events, and p95 runtime.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">Runs In Session</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {benchmarkSummary.sampleSize}
          </div>
        </div>
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">p95 Duration</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatDuration(benchmarkSummary.p95Ms)}
          </div>
          <div
            className={`mt-1 text-[11px] ${
              benchmarkSummary.p95Ms === null
                ? "text-slate-500"
                : p95PassesTarget
                  ? "text-emerald-700"
                  : "text-rose-700"
            }`}
          >
            Target: {formatDuration(targetP95Ms)}
          </div>
        </div>
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">
            Average Field Confidence
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {formatPercent(averageFieldConfidence)}
          </div>
        </div>
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">
            Last Run Cleanup
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {verificationResult?.ocrDiagnostics.cleanupApplied ? "Applied" : "N/A"}
          </div>
        </div>
        <div className="rounded-md bg-slate-100 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-500">
            Avg Evidence Tokens
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {averageEvidenceTokens === null
              ? "N/A"
              : averageEvidenceTokens.toFixed(1)}
          </div>
        </div>
      </div>

      {verificationResult && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-semibold uppercase text-slate-600">
              Status Distribution
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700">
              <div>Pass: {statusCounts.Pass ?? 0}</div>
              <div>Fail: {statusCounts.Fail ?? 0}</div>
              <div>Needs Review: {statusCounts["Needs Review"] ?? 0}</div>
              <div>Missing: {statusCounts.Missing ?? 0}</div>
            </div>
            <div className="mt-3 text-xs text-slate-600">
              Low-confidence fields:{" "}
              {lowConfidenceFields.length > 0
                ? lowConfidenceFields.join(", ")
                : "None"}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Oversized evidence boxes:{" "}
              {oversizedFields.length > 0 ? oversizedFields.join(", ") : "None"}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-xs font-semibold uppercase text-slate-600">
              OCR Runtime Diagnostics
            </h3>
            <div className="mt-2 space-y-1 text-xs text-slate-700">
              <div>
                OCR model: {verificationResult.ocrDiagnostics.model}
              </div>
              <div>
                Timings: service inference{" "}
                {formatDuration(verificationResult.ocrDiagnostics.inferenceMs)}, API
                round-trip{" "}
                {formatDuration(verificationResult.ocrDiagnostics.apiRoundTripMs)},
                total OCR {formatDuration(verificationResult.ocrDiagnostics.totalOcrMs)}
              </div>
              <div>
                OCR line count: {verificationResult.ocrDiagnostics.lineCount}
              </div>
              <div>
                OCR token count: {verificationResult.ocrDiagnostics.tokenCount}
              </div>
              <div>
                Evidence sources: word {evidenceSourceCounts.word}, line{" "}
                {evidenceSourceCounts.line}, none {evidenceSourceCounts.none}
              </div>
              <div>
                Cleared transient artifacts:{" "}
                {verificationResult.ocrDiagnostics.transientArtifactsCleared.length > 0
                  ? verificationResult.ocrDiagnostics.transientArtifactsCleared.join(", ")
                  : "None"}
              </div>
              <div>
                Warnings:{" "}
                {verificationResult.ocrDiagnostics.warnings.length > 0
                  ? verificationResult.ocrDiagnostics.warnings.join(" | ")
                  : "None"}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <h3 className="text-xs font-semibold uppercase text-slate-600">
          Error Diagnostics
        </h3>
        {lastError ? (
          <div className="mt-2 text-xs text-rose-700">
            <div>Stage: {lastError.stage}</div>
            <div>Time: {new Date(lastError.timestamp).toLocaleString()}</div>
            <div className="mt-1">Message: {lastError.message}</div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-600">
            No structured errors recorded in this session.
          </p>
        )}
      </div>
    </section>
  );
};
