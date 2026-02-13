"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { LabelPreview } from "@/components/label-preview";
import { ReviewControlsPanel } from "@/components/review-controls-panel";
import { ResultsTable } from "@/components/results-table";
import { UploadsPanel } from "@/components/uploads-panel";
import { isDemoMode } from "@/lib/app-mode";
import {
  listDemoFixtures,
  loadDemoFixtureById,
} from "@/lib/demo-fixtures";
import { runLocalOcr } from "@/lib/ocr";
import { parseApplicationJson } from "@/lib/schemas";
import type {
  BatchDecision,
  BatchJobStatus,
  BatchJobSummary,
  CanonicalApplication,
  FieldKey,
  VerificationResult,
} from "@/lib/types";
import type {
  FixtureLoadPayload,
  FixtureOption,
} from "@/lib/demo-fixtures";
import { verifyLabelLines } from "@/lib/verification";

type WorkbenchBatchJob = {
  labelId: string;
  labelFileName: string;
  jsonFileName: string;
  labelFile: File;
  previewImageUrl: string;
  application: CanonicalApplication;
  status: BatchJobStatus;
  verificationResult: VerificationResult | null;
  error: string | null;
  decision: BatchDecision;
};

const MAX_BATCH_SIZE = 10;
const SELECTION_PREVIEW_LIMIT = 3;
const BATCH_ALL_DEMO_FIXTURES_ID = "__batch_all_demo_fixtures__";

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const normalizeFileName = (value: string) => {
  return value.trim().toLowerCase();
};

const stripExtension = (value: string) => {
  return value.replace(/\.[^/.]+$/, "");
};

const normalizeStem = (value: string) => {
  return stripExtension(value)
    .toLowerCase()
    .replace(/_form$/i, "")
    .replace(/[^a-z0-9]/g, "");
};

const extractLegacyLabelImageName = (rawJson: unknown) => {
  if (!isObjectRecord(rawJson)) {
    return null;
  }

  const rawValue = rawJson.label_image_name;
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
};

const summarizeSelection = (files: File[]) => {
  if (files.length === 0) {
    return "No files selected";
  }

  const previewNames = files
    .slice(0, SELECTION_PREVIEW_LIMIT)
    .map((file) => file.name)
    .join(", ");
  const remainingCount = files.length - SELECTION_PREVIEW_LIMIT;
  if (remainingCount > 0) {
    return `Selected ${files.length}: ${previewNames}, +${remainingCount} more`;
  }

  return `Selected ${files.length}: ${previewNames}`;
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
  const [uploadedLabelFiles, setUploadedLabelFiles] = useState<File[]>([]);
  const [uploadedJsonFiles, setUploadedJsonFiles] = useState<File[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [batchJobs, setBatchJobs] = useState<WorkbenchBatchJob[]>([]);
  const [activeJobIndex, setActiveJobIndex] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null);

  const activeJob = useMemo(() => {
    if (batchJobs.length === 0) {
      return null;
    }

    return batchJobs[activeJobIndex] ?? null;
  }, [activeJobIndex, batchJobs]);

  const activeApplication = activeJob?.application ?? null;
  const activeVerificationResult = activeJob?.verificationResult ?? null;
  const previewImageUrl = activeJob?.previewImageUrl ?? null;

  const labelSelectionSummary = useMemo(() => {
    return summarizeSelection(uploadedLabelFiles);
  }, [uploadedLabelFiles]);

  const jsonSelectionSummary = useMemo(() => {
    return summarizeSelection(uploadedJsonFiles);
  }, [uploadedJsonFiles]);

  const canRunVerification = useMemo(() => {
    if (isRunning) {
      return false;
    }

    if (uploadedLabelFiles.length > 0 || uploadedJsonFiles.length > 0) {
      return uploadedLabelFiles.length > 0 && uploadedJsonFiles.length > 0;
    }

    return batchJobs.length > 0;
  }, [batchJobs.length, isRunning, uploadedJsonFiles.length, uploadedLabelFiles.length]);

  const canDownloadJson = useMemo(() => {
    return batchJobs.length > 0 && !isRunning;
  }, [batchJobs.length, isRunning]);

  const batchProgress = useMemo(() => {
    return batchJobs.reduce(
      (summary, job) => {
        summary[job.status] += 1;
        if (job.decision === "undecided") {
          summary.undecided += 1;
        } else {
          summary.decided += 1;
        }
        return summary;
      },
      {
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        decided: 0,
        undecided: 0,
      },
    );
  }, [batchJobs]);

  const processedCount = batchProgress.completed + batchProgress.failed;
  const canJumpToFirstUndecided =
    !isRunning && batchJobs.some((job) => job.decision === "undecided");
  const canApproveOrDeny = Boolean(activeJob && activeJob.status !== "running");

  useEffect(() => {
    setSelectedField(null);
  }, [activeJobIndex]);

  useEffect(() => {
    const loadFixtureList = async () => {
      try {
        if (isDemoMode) {
          const demoFixtures = listDemoFixtures();
          setFixtureOptions([
            {
              id: BATCH_ALL_DEMO_FIXTURES_ID,
              formFileName: "all_demo_forms",
              labelFileName: "all_demo_labels",
              displayName: "Batch Process (All 8 Samples)",
            },
            ...demoFixtures,
          ]);
          return;
        }

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

  const handleLabelUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (isDemoMode) {
      return;
    }

    const nextFiles = Array.from(event.target.files ?? []);
    setUploadedLabelFiles(nextFiles);
    setSelectedFixtureId("");
    setFixtureError(null);
    setJsonError(null);
    setRunError(null);
    setBatchJobs([]);
    setActiveJobIndex(0);
    setSelectedField(null);
  };

  const handleJsonUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (isDemoMode) {
      return;
    }

    const nextFiles = Array.from(event.target.files ?? []);
    setUploadedJsonFiles(nextFiles);
    setSelectedFixtureId("");
    setFixtureError(null);
    setJsonError(null);
    setRunError(null);
    setBatchJobs([]);
    setActiveJobIndex(0);
    setSelectedField(null);
  };

  const runVerification = async (
    nextLabelFile: File,
    nextApplication: CanonicalApplication,
  ): Promise<VerificationResult> => {
    const startTimeMs = Date.now();
    const startPerformanceTime = performance.now();

    const ocrResult = await runLocalOcr(nextLabelFile);
    const ocrLines = ocrResult.lines;
    const ocrTokens = ocrResult.tokens;
    const ocrCoordinateSpace = ocrResult.coordinateSpace;
    const fieldResults = verifyLabelLines(nextApplication, ocrLines, ocrTokens);
    const endPerformanceTime = performance.now();
    const endTimeMs = Date.now();
    const durationMs = Math.round(endPerformanceTime - startPerformanceTime);

    return {
      fields: fieldResults,
      ocrLines,
      ocrTokens,
      ocrCoordinateSpace,
      ocrDiagnostics: ocrResult.diagnostics,
      startedAt: new Date(startTimeMs).toISOString(),
      endedAt: new Date(endTimeMs).toISOString(),
      durationMs,
    };
  };

  const buildBatchJobsFromUploads = async (): Promise<{
    jobs: WorkbenchBatchJob[];
    errors: string[];
  }> => {
    const errors: string[] = [];
    if (uploadedLabelFiles.length === 0 || uploadedJsonFiles.length === 0) {
      errors.push("Select at least one label image and one application JSON file.");
      return { jobs: [], errors };
    }

    const labelFilesByName = new Map<string, File>();
    const labelFilesByStem = new Map<string, File[]>();

    uploadedLabelFiles.forEach((labelFile) => {
      const normalizedName = normalizeFileName(labelFile.name);
      labelFilesByName.set(normalizedName, labelFile);

      const stem = normalizeStem(labelFile.name);
      if (!stem) {
        return;
      }

      const existingMatches = labelFilesByStem.get(stem) ?? [];
      existingMatches.push(labelFile);
      labelFilesByStem.set(stem, existingMatches);
    });

    const resolveUniqueLabelByStem = (stem: string) => {
      if (!stem) {
        return null;
      }

      const matches = labelFilesByStem.get(stem) ?? [];
      if (matches.length !== 1) {
        return null;
      }

      return matches[0];
    };

    const matchedJobs: WorkbenchBatchJob[] = [];
    const consumedLabelNames = new Set<string>();

    for (const jsonFile of uploadedJsonFiles) {
      try {
        const jsonText = await jsonFile.text();
        const rawJson = JSON.parse(jsonText) as unknown;
        const parsedApplication = parseApplicationJson(rawJson);
        const legacyLabelName = extractLegacyLabelImageName(rawJson);

        let matchedLabelFile: File | null = null;
        if (legacyLabelName) {
          const byExactName = labelFilesByName.get(normalizeFileName(legacyLabelName));
          if (byExactName) {
            matchedLabelFile = byExactName;
          } else {
            matchedLabelFile = resolveUniqueLabelByStem(normalizeStem(legacyLabelName));
          }
        }

        if (!matchedLabelFile) {
          matchedLabelFile = resolveUniqueLabelByStem(normalizeStem(jsonFile.name));
        }

        if (!matchedLabelFile) {
          errors.push(
            `${jsonFile.name}: unable to match a label image by label_image_name or filename stem.`,
          );
          continue;
        }

        const normalizedLabelName = normalizeFileName(matchedLabelFile.name);
        if (consumedLabelNames.has(normalizedLabelName)) {
          errors.push(
            `${jsonFile.name}: label ${matchedLabelFile.name} is already paired with another JSON file.`,
          );
          continue;
        }

        consumedLabelNames.add(normalizedLabelName);
        const previewImageUrl = await toDataUrl(matchedLabelFile);
        const normalizedLabelId = normalizeStem(matchedLabelFile.name);
        const labelId =
          normalizedLabelId.length > 0
            ? normalizedLabelId
            : stripExtension(matchedLabelFile.name).toLowerCase();

        matchedJobs.push({
          labelId,
          labelFileName: matchedLabelFile.name,
          jsonFileName: jsonFile.name,
          labelFile: matchedLabelFile,
          previewImageUrl,
          application: parsedApplication,
          status: "queued",
          verificationResult: null,
          error: null,
          decision: "undecided",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "unknown error while parsing JSON file";
        errors.push(`${jsonFile.name}: ${message}`);
      }
    }

    if (matchedJobs.length > MAX_BATCH_SIZE) {
      errors.push(
        `Batch limit exceeded: matched ${matchedJobs.length} pairs. Limit is ${MAX_BATCH_SIZE}.`,
      );
    }

    if (matchedJobs.length === 0 && errors.length === 0) {
      errors.push("No valid label/form pairs were created from the selected files.");
    }

    return {
      jobs: matchedJobs,
      errors,
    };
  };

  const runBatchJobs = async (initialJobs: WorkbenchBatchJob[]) => {
    if (initialJobs.length === 0) {
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setSelectedField(null);

    const nextJobs: WorkbenchBatchJob[] = initialJobs.map((job) => ({
      ...job,
      status: "queued",
      verificationResult: null,
      error: null,
    }));
    setBatchJobs(nextJobs);
    setActiveJobIndex(0);

    const runErrors: string[] = [];

    for (let index = 0; index < nextJobs.length; index += 1) {
      nextJobs[index] = {
        ...nextJobs[index],
        status: "running",
        error: null,
      };
      setBatchJobs([...nextJobs]);

      try {
        const verificationResult = await runVerification(
          nextJobs[index].labelFile,
          nextJobs[index].application,
        );

        nextJobs[index] = {
          ...nextJobs[index],
          status: "completed",
          verificationResult,
          error: null,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? `Verification failed: ${error.message}`
            : "Verification failed: unknown error";
        nextJobs[index] = {
          ...nextJobs[index],
          status: "failed",
          verificationResult: null,
          error: message,
        };
        runErrors.push(`${nextJobs[index].labelFileName}: ${message}`);
      }

      setBatchJobs([...nextJobs]);
      setActiveJobIndex((currentIndex) => {
        const currentJob = nextJobs[currentIndex];
        if (!currentJob) {
          return index;
        }

        if (
          currentJob.verificationResult !== null
          || currentJob.status === "failed"
          || currentJob.status === "completed"
        ) {
          return currentIndex;
        }

        return index;
      });
    }

    if (runErrors.length > 0) {
      setRunError(`Completed with errors: ${runErrors.join(" | ")}`);
    }

    setIsRunning(false);
  };

  const buildJobFromFixturePayload = (payload: FixtureLoadPayload): WorkbenchBatchJob => {
    const labelBytes = Uint8Array.from(atob(payload.labelBase64), (character) =>
      character.charCodeAt(0),
    );
    const labelBlob = new Blob([labelBytes], { type: payload.labelMimeType });
    const loadedLabelFile = new File([labelBlob], payload.labelFileName, {
      type: payload.labelMimeType,
    });
    const loadedApplication = parseApplicationJson(payload.formJson);
    const previewUrl = `data:${payload.labelMimeType};base64,${payload.labelBase64}`;

    return {
      labelId: normalizeStem(payload.labelFileName) || payload.id,
      labelFileName: payload.labelFileName,
      jsonFileName: payload.formFileName,
      labelFile: loadedLabelFile,
      previewImageUrl: previewUrl,
      application: loadedApplication,
      status: "queued",
      verificationResult: null,
      error: null,
      decision: "undecided",
    };
  };

  const loadAllDemoFixtures = async (autoRun: boolean) => {
    setIsFixtureLoading(true);
    setFixtureError(null);
    setRunError(null);
    setJsonError(null);
    setBatchJobs([]);
    setActiveJobIndex(0);

    try {
      const demoFixtureIds = listDemoFixtures().map((fixture) => fixture.id);
      const payloads = await Promise.all(
        demoFixtureIds.map(async (fixtureId) => loadDemoFixtureById(fixtureId)),
      );
      const loadedJobs = payloads.map((payload) => buildJobFromFixturePayload(payload));

      setUploadedLabelFiles([]);
      setUploadedJsonFiles([]);
      setBatchJobs(loadedJobs);
      setActiveJobIndex(0);
      setSelectedField(null);

      if (autoRun) {
        await runBatchJobs(loadedJobs);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load demo fixture batch.";
      setFixtureError(message);
      setRunError(message);
    } finally {
      setIsFixtureLoading(false);
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
    setBatchJobs([]);
    setActiveJobIndex(0);

    try {
      const payload: FixtureLoadPayload = isDemoMode
        ? await loadDemoFixtureById(fixtureId)
        : await (async () => {
            const response = await fetch(
              `/api/test-fixtures?id=${encodeURIComponent(fixtureId)}`,
              {
                cache: "no-store",
              },
            );
            const responsePayload = (await response.json()) as FixtureLoadPayload & {
              error?: string;
            };
            if (!response.ok) {
              throw new Error(responsePayload.error ?? "Unable to load selected fixture.");
            }

            return responsePayload;
          })();

      const loadedJob = buildJobFromFixturePayload(payload);

      setUploadedLabelFiles([]);
      setUploadedJsonFiles([]);
      setBatchJobs([loadedJob]);
      setActiveJobIndex(0);
      setSelectedField(null);

      if (autoRun) {
        await runBatchJobs([loadedJob]);
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

    if (isDemoMode && fixtureId === BATCH_ALL_DEMO_FIXTURES_ID) {
      await loadAllDemoFixtures(true);
      return;
    }

    await loadFixtureById(fixtureId, true);
  };

  const handleRunVerification = async () => {
    setJsonError(null);
    setRunError(null);

    let jobsForRun: WorkbenchBatchJob[] = [];
    if (uploadedLabelFiles.length > 0 || uploadedJsonFiles.length > 0) {
      const { jobs, errors } = await buildBatchJobsFromUploads();
      if (errors.length > 0) {
        setJsonError(errors.join(" | "));
        return;
      }
      jobsForRun = jobs;
    } else if (batchJobs.length > 0) {
      jobsForRun = batchJobs.map((job) => ({
        ...job,
        status: "queued",
        verificationResult: null,
        error: null,
      }));
    }

    if (jobsForRun.length > MAX_BATCH_SIZE) {
      setJsonError(
        `Batch limit exceeded: ${jobsForRun.length} pairs selected. Limit is ${MAX_BATCH_SIZE}.`,
      );
      return;
    }

    if (jobsForRun.length === 0) {
      return;
    }

    await runBatchJobs(jobsForRun);
  };

  const handleSetDecision = (decision: BatchDecision) => {
    if (!activeJob) {
      return;
    }

    setBatchJobs((previousJobs) => {
      return previousJobs.map((job, index) => {
        if (index !== activeJobIndex) {
          return job;
        }

        return {
          ...job,
          decision,
        };
      });
    });
  };

  const handlePreviousLabel = () => {
    if (activeJobIndex <= 0) {
      return;
    }

    setActiveJobIndex((currentIndex) => Math.max(0, currentIndex - 1));
  };

  const handleNextLabel = () => {
    if (activeJobIndex >= batchJobs.length - 1) {
      return;
    }

    setActiveJobIndex((currentIndex) =>
      Math.min(batchJobs.length - 1, currentIndex + 1),
    );
  };

  const handleJumpToFirstUndecided = () => {
    const firstUndecidedIndex = batchJobs.findIndex(
      (job) => job.decision === "undecided",
    );
    if (firstUndecidedIndex === -1) {
      return;
    }

    setActiveJobIndex(firstUndecidedIndex);
  };

  const handleDownloadJson = () => {
    const payload: BatchJobSummary[] = batchJobs.map((job) => ({
      labelId: job.labelId,
      decision: job.decision,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `batch-decisions-${timestamp}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="grid gap-4">
      <UploadsPanel
        isDemoMode={isDemoMode}
        fixtureOptions={fixtureOptions}
        selectedFixtureId={selectedFixtureId}
        isFixtureLoading={isFixtureLoading}
        fixtureError={fixtureError}
        handleFixtureSelection={handleFixtureSelection}
        labelSelectionSummary={labelSelectionSummary}
        jsonSelectionSummary={jsonSelectionSummary}
        jsonError={jsonError}
        runError={runError}
        isRunning={isRunning}
        canRunVerification={canRunVerification}
        batchCount={batchJobs.length}
        maxBatchSize={MAX_BATCH_SIZE}
        activeBatchIndex={batchJobs.length > 0 ? activeJobIndex : null}
        activeLabelId={activeJob?.labelId ?? null}
        processedCount={processedCount}
        completedCount={batchProgress.completed}
        failedCount={batchProgress.failed}
        decidedCount={batchProgress.decided}
        undecidedCount={batchProgress.undecided}
        handleLabelUpload={handleLabelUpload}
        handleJsonUpload={handleJsonUpload}
        handleRunVerification={handleRunVerification}
      />

      {activeApplication && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Parsed Application
          </h2>
          <div className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Application ID
              </span>
              <p className="font-medium">{activeApplication.applicationId}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Alcohol Class
              </span>
              <p className="font-medium">{activeApplication.alcoholClass}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">Import</span>
              <p className="font-medium">{activeApplication.isImport ? "Yes" : "No"}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2">
              <span className="text-xs uppercase text-slate-500">
                Source Schema
              </span>
              <p className="font-medium">{activeApplication.sourceSchema}</p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_minmax(0,1fr)_220px]">
        <div>
          {!activeVerificationResult ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
              Run verification to generate field-level results for the active label.
            </div>
          ) : (
            <ResultsTable
              results={activeVerificationResult.fields}
              selectedField={selectedField}
              handleFieldHover={setSelectedField}
            />
          )}
        </div>

        <div className="self-start xl:sticky xl:top-4">
          <LabelPreview
            imageUrl={previewImageUrl}
            results={activeVerificationResult?.fields ?? []}
            selectedField={selectedField}
            ocrCoordinateSpace={activeVerificationResult?.ocrCoordinateSpace ?? null}
          />
        </div>

        <ReviewControlsPanel
          decision={activeJob?.decision ?? "undecided"}
          canApproveOrDeny={canApproveOrDeny}
          canGoPrevious={activeJobIndex > 0}
          canGoNext={activeJobIndex < batchJobs.length - 1}
          canJumpToFirstUndecided={canJumpToFirstUndecided}
          canDownloadJson={canDownloadJson}
          handleApprove={() => {
            handleSetDecision("approve");
          }}
          handleDeny={() => {
            handleSetDecision("deny");
          }}
          handlePreviousLabel={handlePreviousLabel}
          handleNextLabel={handleNextLabel}
          handleJumpToFirstUndecided={handleJumpToFirstUndecided}
          handleDownloadJson={handleDownloadJson}
        />
      </div>
    </div>
  );
};
