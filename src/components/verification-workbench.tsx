"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { LabelPreview } from "@/components/label-preview";
import { OperatorDiagnostics } from "@/components/operator-diagnostics";
import { ResultsTable } from "@/components/results-table";
import { UploadsPanel } from "@/components/uploads-panel";
import { runLocalOcr } from "@/lib/ocr";
import { parseApplicationJson } from "@/lib/schemas";
import type {
  CanonicalApplication,
  FieldKey,
  VerificationResult,
} from "@/lib/types";
import { verifyLabelLines } from "@/lib/verification";

type OperatorError = {
  stage: "json_parse" | "verification_run";
  message: string;
  timestamp: string;
};

const toDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to create image preview."));
        return;
      }

      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read image preview."));
    reader.readAsDataURL(file);
  });
};

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
};

export const VerificationWorkbench = () => {
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [application, setApplication] = useState<CanonicalApplication | null>(
    null,
  );
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [runDurationsMs, setRunDurationsMs] = useState<number[]>([]);
  const [lastError, setLastError] = useState<OperatorError | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [ocrProgressPercent, setOcrProgressPercent] = useState<number | null>(
    null,
  );
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);

  const canRunVerification = useMemo(() => {
    return Boolean(labelFile && application && !jsonError);
  }, [application, jsonError, labelFile]);

  const handleClearSession = () => {
    setLabelFile(null);
    setPreviewImageUrl(null);
    setApplication(null);
    setJsonFileName(null);
    setJsonError(null);
    setRunError(null);
    setCleanupNote("Session artifacts were cleared.");
    setVerificationResult(null);
    setOcrProgressPercent(null);
    setSelectedField(null);
  };

  const handleLabelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const nextPreviewImageUrl = await toDataUrl(file);
      setPreviewImageUrl(nextPreviewImageUrl);
      setLabelFile(file);
      setCleanupNote(null);
      setVerificationResult(null);
      setRunError(null);
      setSelectedField(null);
    } catch (error) {
      setLabelFile(null);
      setPreviewImageUrl(null);
      const message =
        error instanceof Error ? error.message : "Unable to process label image.";
      setRunError(message);
      setLastError({
        stage: "verification_run",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleJsonUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setJsonFileName(file.name);
    setRunError(null);
    setCleanupNote(null);

    try {
      const jsonContent = await file.text();
      const parsedJson = JSON.parse(jsonContent) as unknown;
      const parsedApplication = parseApplicationJson(parsedJson);

      setApplication(parsedApplication);
      setJsonError(null);
      setVerificationResult(null);
      setSelectedField(null);
    } catch (error) {
      setApplication(null);
      setVerificationResult(null);
      setSelectedField(null);

      if (error instanceof Error) {
        const message = `Invalid application JSON: ${error.message}`;
        setJsonError(message);
        setLastError({
          stage: "json_parse",
          message,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const message = "Invalid application JSON: unknown error";
      setJsonError(message);
      setLastError({
        stage: "json_parse",
        message,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleRunVerification = async () => {
    if (!labelFile || !application) {
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setCleanupNote(null);
    setSelectedField(null);
    setOcrProgressPercent(0);

    const startTimeMs = Date.now();
    const startPerformanceTime = performance.now();

    try {
      const ocrResult = await runLocalOcr(labelFile, (progress) => {
        setOcrProgressPercent(Math.round(progress * 100));
      });
      const ocrLines = ocrResult.lines;

      const fieldResults = verifyLabelLines(application, ocrLines);
      const endPerformanceTime = performance.now();
      const endTimeMs = Date.now();
      const durationMs = Math.round(endPerformanceTime - startPerformanceTime);

      setVerificationResult({
        fields: fieldResults,
        ocrLines,
        ocrDiagnostics: ocrResult.diagnostics,
        startedAt: new Date(startTimeMs).toISOString(),
        endedAt: new Date(endTimeMs).toISOString(),
        durationMs,
      });
      setRunDurationsMs((currentDurations) => {
        const nextDurations = [...currentDurations, durationMs];
        return nextDurations.slice(-100);
      });
    } catch (error) {
      if (error instanceof Error) {
        const message = `Verification failed: ${error.message}`;
        setRunError(message);
        setLastError({
          stage: "verification_run",
          message,
          timestamp: new Date().toISOString(),
        });
      } else {
        const message = "Verification failed: unknown error";
        setRunError(message);
        setLastError({
          stage: "verification_run",
          message,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      setIsRunning(false);
      setOcrProgressPercent(null);
      setLabelFile(null);
      setApplication(null);
      setJsonFileName(null);
      setCleanupNote(
        "Transient upload artifacts were cleared from memory after run completion. Re-upload files for another run.",
      );
    }
  };

  return (
    <div className="grid gap-6">
      <UploadsPanel
        labelFileName={labelFile?.name ?? null}
        jsonFileName={jsonFileName}
        jsonError={jsonError}
        runError={runError}
        cleanupNote={cleanupNote}
        isRunning={isRunning}
        canRunVerification={canRunVerification}
        ocrProgressPercent={ocrProgressPercent}
        handleLabelUpload={handleLabelUpload}
        handleJsonUpload={handleJsonUpload}
        handleRunVerification={handleRunVerification}
        handleClearSession={handleClearSession}
      />

      <OperatorDiagnostics
        verificationResult={verificationResult}
        runDurationsMs={runDurationsMs}
        lastError={lastError}
      />

      {application && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Parsed Application
          </h2>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Application ID
              </span>
              <p className="font-medium">{application.applicationId}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Alcohol Class
              </span>
              <p className="font-medium">{application.alcoholClass}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">Import</span>
              <p className="font-medium">{application.isImport ? "Yes" : "No"}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Source Schema
              </span>
              <p className="font-medium">{application.sourceSchema}</p>
            </div>
          </div>
        </section>
      )}

      {verificationResult && (
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Verification Run
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Started: {new Date(verificationResult.startedAt).toLocaleString()} |{" "}
            Ended: {new Date(verificationResult.endedAt).toLocaleString()} |{" "}
            Duration: {formatDuration(verificationResult.durationMs)} | OCR lines:{" "}
            {verificationResult.ocrLines.length}
          </p>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div>
          {!verificationResult ? (
            <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600 shadow-sm">
              Run verification to generate field-level results.
            </div>
          ) : (
            <ResultsTable
              results={verificationResult.fields}
              selectedField={selectedField}
              handleFieldHover={setSelectedField}
            />
          )}
        </div>

        <LabelPreview
          imageUrl={previewImageUrl}
          results={verificationResult?.fields ?? []}
          selectedField={selectedField}
        />
      </div>
    </div>
  );
};
