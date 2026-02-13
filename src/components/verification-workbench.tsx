"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { LabelPreview } from "@/components/label-preview";
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

type FixtureOption = {
  id: string;
  formFileName: string;
  labelFileName: string;
};

type FixtureLoadPayload = {
  id: string;
  formFileName: string;
  labelFileName: string;
  labelMimeType: string;
  labelBase64: string;
  formJson: unknown;
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

export const VerificationWorkbench = () => {
  const [fixtureOptions, setFixtureOptions] = useState<FixtureOption[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [isFixtureLoading, setIsFixtureLoading] = useState(false);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [application, setApplication] = useState<CanonicalApplication | null>(
    null,
  );
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);

  const canRunVerification = useMemo(() => {
    return Boolean(labelFile && application && !jsonError);
  }, [application, jsonError, labelFile]);

  useEffect(() => {
    const loadFixtureList = async () => {
      try {
        const response = await fetch("/api/test-fixtures", { cache: "no-store" });
        const payload = (await response.json()) as {
          fixtures?: FixtureOption[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load fixture list.");
        }

        setFixtureOptions(payload.fixtures ?? []);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load fixture list.";
        setFixtureError(message);
      }
    };

    void loadFixtureList();
  }, []);

  const handleLabelUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const nextPreviewImageUrl = await toDataUrl(file);
      setPreviewImageUrl(nextPreviewImageUrl);
      setLabelFile(file);
      setVerificationResult(null);
      setRunError(null);
      setSelectedField(null);
      setFixtureError(null);
    } catch (error) {
      setLabelFile(null);
      setPreviewImageUrl(null);
      const message =
        error instanceof Error ? error.message : "Unable to process label image.";
      setRunError(message);
    }
  };

  const handleJsonUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setJsonFileName(file.name);
    setRunError(null);
    setFixtureError(null);

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
        return;
      }

      const message = "Invalid application JSON: unknown error";
      setJsonError(message);
    }
  };

  const runVerification = async (
    nextLabelFile: File,
    nextApplication: CanonicalApplication,
  ) => {
    setIsRunning(true);
    setRunError(null);
    setSelectedField(null);

    const startTimeMs = Date.now();
    const startPerformanceTime = performance.now();

    try {
      const ocrResult = await runLocalOcr(nextLabelFile);
      const ocrLines = ocrResult.lines;
      const ocrTokens = ocrResult.tokens;
      const ocrCoordinateSpace = ocrResult.coordinateSpace;
      const fieldResults = verifyLabelLines(nextApplication, ocrLines, ocrTokens);
      const endPerformanceTime = performance.now();
      const endTimeMs = Date.now();
      const durationMs = Math.round(endPerformanceTime - startPerformanceTime);

      setVerificationResult({
        fields: fieldResults,
        ocrLines,
        ocrTokens,
        ocrCoordinateSpace,
        ocrDiagnostics: ocrResult.diagnostics,
        startedAt: new Date(startTimeMs).toISOString(),
        endedAt: new Date(endTimeMs).toISOString(),
        durationMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        const message = `Verification failed: ${error.message}`;
        setRunError(message);
      } else {
        const message = "Verification failed: unknown error";
        setRunError(message);
      }
    } finally {
      setIsRunning(false);
      setLabelFile(null);
      setApplication(null);
      setJsonFileName(null);
    }
  };

  const loadFixtureById = async (fixtureId: string, autoRun: boolean) => {
    if (!fixtureId) {
      return;
    }

    setIsFixtureLoading(true);
    setFixtureError(null);
    setRunError(null);
    setJsonError(null);

    try {
      const response = await fetch(`/api/test-fixtures?id=${encodeURIComponent(fixtureId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as FixtureLoadPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load selected fixture.");
      }

      const labelBytes = Uint8Array.from(atob(payload.labelBase64), (character) =>
        character.charCodeAt(0),
      );
      const labelBlob = new Blob([labelBytes], { type: payload.labelMimeType });
      const loadedLabelFile = new File([labelBlob], payload.labelFileName, {
        type: payload.labelMimeType,
      });
      const loadedApplication = parseApplicationJson(payload.formJson);
      const previewUrl = `data:${payload.labelMimeType};base64,${payload.labelBase64}`;

      setLabelFile(loadedLabelFile);
      setPreviewImageUrl(previewUrl);
      setApplication(loadedApplication);
      setJsonFileName(payload.formFileName);
      setVerificationResult(null);
      setSelectedField(null);

      if (autoRun) {
        await runVerification(loadedLabelFile, loadedApplication);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load selected fixture.";
      setFixtureError(message);
      setRunError(message);
    } finally {
      setIsFixtureLoading(false);
    }
  };

  const handleFixtureSelection = async (fixtureId: string) => {
    setSelectedFixtureId(fixtureId);
    if (!fixtureId) {
      return;
    }

    await loadFixtureById(fixtureId, true);
  };

  const handleRunVerification = async () => {
    if (!labelFile || !application) {
      return;
    }
    await runVerification(labelFile, application);
  };

  return (
    <div className="grid gap-4">
      <UploadsPanel
        fixtureOptions={fixtureOptions}
        selectedFixtureId={selectedFixtureId}
        isFixtureLoading={isFixtureLoading}
        fixtureError={fixtureError}
        handleFixtureSelection={handleFixtureSelection}
        labelFileName={labelFile?.name ?? null}
        jsonFileName={jsonFileName}
        jsonError={jsonError}
        runError={runError}
        isRunning={isRunning}
        canRunVerification={canRunVerification}
        handleLabelUpload={handleLabelUpload}
        handleJsonUpload={handleJsonUpload}
        handleRunVerification={handleRunVerification}
      />

      {application && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Parsed Application
          </h2>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div>
          {!verificationResult ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
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
          ocrCoordinateSpace={verificationResult?.ocrCoordinateSpace ?? null}
        />
      </div>
    </div>
  );
};
