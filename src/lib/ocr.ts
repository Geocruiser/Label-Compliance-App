import type { OcrLine, OcrRunDiagnostics } from "@/lib/types";
import { preprocessImageForOcr, rotateImageBlob } from "@/lib/image-preprocess";

type OcrProgressHandler = (percent: number) => void;
type OcrRunResult = {
  lines: OcrLine[];
  diagnostics: OcrRunDiagnostics;
};

const sanitizeConfidence = (confidence: number | undefined) => {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return 0;
  }

  return Math.max(0, Math.min(1, confidence / 100));
};

type TsvLineAccumulator = {
  tokens: string[];
  confidenceTotal: number;
  confidenceCount: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const parseTsvLines = (tsv: string | null): OcrLine[] => {
  if (!tsv?.trim()) {
    return [];
  }

  const rows = tsv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  if (rows.length <= 1) {
    return [];
  }

  const accumulators = new Map<string, TsvLineAccumulator>();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const columns = rows[rowIndex].split("\t");
    if (columns.length < 12) {
      continue;
    }

    const level = Number(columns[0]);
    const blockNumber = columns[2];
    const paragraphNumber = columns[3];
    const lineNumber = columns[4];
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const token = columns[11];

    if (level !== 5 || !token || token.trim().length === 0) {
      continue;
    }

    const lineKey = `${blockNumber}-${paragraphNumber}-${lineNumber}`;
    const currentAccumulator = accumulators.get(lineKey);
    const right = left + width;
    const bottom = top + height;

    if (!currentAccumulator) {
      accumulators.set(lineKey, {
        tokens: [token.trim()],
        confidenceTotal: Number.isFinite(confidence) ? confidence : 0,
        confidenceCount: Number.isFinite(confidence) ? 1 : 0,
        x0: left,
        y0: top,
        x1: right,
        y1: bottom,
      });
      continue;
    }

    currentAccumulator.tokens.push(token.trim());
    if (Number.isFinite(confidence)) {
      currentAccumulator.confidenceTotal += confidence;
      currentAccumulator.confidenceCount += 1;
    }
    currentAccumulator.x0 = Math.min(currentAccumulator.x0, left);
    currentAccumulator.y0 = Math.min(currentAccumulator.y0, top);
    currentAccumulator.x1 = Math.max(currentAccumulator.x1, right);
    currentAccumulator.y1 = Math.max(currentAccumulator.y1, bottom);
  }

  return [...accumulators.values()]
    .map<OcrLine>((accumulator) => {
      const avgConfidence =
        accumulator.confidenceCount > 0
          ? accumulator.confidenceTotal / accumulator.confidenceCount
          : 0;

      return {
        text: accumulator.tokens.join(" ").trim(),
        confidence: sanitizeConfidence(avgConfidence),
        bbox: {
          x0: accumulator.x0,
          y0: accumulator.y0,
          x1: accumulator.x1,
          y1: accumulator.y1,
        },
      };
    })
    .filter((line) => line.text.length > 0);
};

const parsePlainTextLines = (text: string): OcrLine[] => {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((lineText, index) => {
      const rowHeight = 18;
      const top = index * rowHeight;
      return {
        text: lineText,
        confidence: 0.45,
        // Synthetic box fallback only when OCR does not provide geometric metadata.
        bbox: {
          x0: 0,
          y0: top,
          x1: 1000,
          y1: top + rowHeight,
        },
      };
    });
};

type OcrRectangle = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const getImageDimensions = async (image: Blob) => {
  const bitmap = await createImageBitmap(image);
  const dimensions = {
    width: bitmap.width,
    height: bitmap.height,
  };

  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  return dimensions;
};

const buildBrandFocusRectangles = (width: number, height: number): OcrRectangle[] => {
  const topFullHeight = Math.max(1, Math.round(height * 0.55));
  const topBandHeight = Math.max(1, Math.round(height * 0.36));
  const centerWidth = Math.max(1, Math.round(width * 0.78));
  const centerLeft = Math.max(0, Math.round((width - centerWidth) / 2));
  const centerTopHeight = Math.max(1, Math.round(height * 0.66));

  return [
    {
      left: 0,
      top: 0,
      width,
      height: topFullHeight,
    },
    {
      left: 0,
      top: 0,
      width,
      height: topBandHeight,
    },
    {
      left: centerLeft,
      top: 0,
      width: centerWidth,
      height: centerTopHeight,
    },
  ];
};

const offsetFocusedLines = (lines: OcrLine[], rectangle: OcrRectangle) => {
  if (lines.length === 0) {
    return lines;
  }

  const appearsRelativeToCrop = lines.every((line) => {
    return line.bbox.x1 <= rectangle.width + 3 && line.bbox.y1 <= rectangle.height + 3;
  });

  if (!appearsRelativeToCrop) {
    return lines;
  }

  return lines.map((line) => ({
    ...line,
    bbox: {
      x0: line.bbox.x0 + rectangle.left,
      y0: line.bbox.y0 + rectangle.top,
      x1: line.bbox.x1 + rectangle.left,
      y1: line.bbox.y1 + rectangle.top,
    },
  }));
};

const normalizeLineKeyText = (value: string) => {
  return value.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
};

const lineKey = (line: OcrLine) => {
  const x0 = Math.round(line.bbox.x0 / 8);
  const y0 = Math.round(line.bbox.y0 / 8);
  const x1 = Math.round(line.bbox.x1 / 8);
  const y1 = Math.round(line.bbox.y1 / 8);
  return `${normalizeLineKeyText(line.text)}|${x0},${y0},${x1},${y1}`;
};

const mergeOcrLines = (...lineCollections: OcrLine[][]) => {
  const mergedByKey = new Map<string, OcrLine>();

  for (const lineCollection of lineCollections) {
    for (const line of lineCollection) {
      const key = lineKey(line);
      const current = mergedByKey.get(key);
      if (!current || line.confidence > current.confidence) {
        mergedByKey.set(key, line);
      }
    }
  }

  return [...mergedByKey.values()].sort((left, right) => {
    if (left.bbox.y0 === right.bbox.y0) {
      return left.bbox.x0 - right.bbox.x0;
    }

    return left.bbox.y0 - right.bbox.y0;
  });
};

export const runLocalOcr = async (
  imageFile: File,
  handleProgress?: OcrProgressHandler,
): Promise<OcrRunResult> => {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const warnings: string[] = [];
  let preprocessSteps: string[] = [];
  let preprocessedBlob: Blob | null = null;
  let orientedBlob: Blob | null = null;
  let preprocessMs = 0;
  let detectionMs = 0;
  let preprocessedRecognizeMs = 0;
  let rawRecognizeMs = 0;
  let runResult: OcrRunResult | null = null;
  const totalStartedAt = performance.now();

  const toOcrLines = (data: Tesseract.Page): OcrLine[] => {
    const blockLines =
      data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) => paragraph.lines),
      ) ?? [];

    const blockDerivedLines = blockLines
      .map<OcrLine | null>((line) => {
        if (!line.text?.trim()) {
          return null;
        }

        return {
          text: line.text.trim(),
          confidence: sanitizeConfidence(line.confidence),
          bbox: {
            x0: line.bbox.x0,
            y0: line.bbox.y0,
            x1: line.bbox.x1,
            y1: line.bbox.y1,
          },
        };
      })
      .filter((line): line is OcrLine => line !== null);

    if (blockDerivedLines.length > 0) {
      return blockDerivedLines;
    }

    const tsvDerivedLines = parseTsvLines(data.tsv);
    if (tsvDerivedLines.length > 0) {
      return tsvDerivedLines;
    }

    if (data.text.trim().length > 0) {
      return parsePlainTextLines(data.text);
    }

    return [];
  };

  const scoreExtractionQuality = (lines: OcrLine[]) => {
    if (lines.length === 0) {
      return 0;
    }

    const avgConfidence =
      lines.reduce((total, current) => total + current.confidence, 0) /
      lines.length;
    return lines.length + (avgConfidence * 10);
  };

  try {
    handleProgress?.(0.05);
    const preprocessStartedAt = performance.now();
    const preprocessed = await preprocessImageForOcr(imageFile);
    preprocessMs = Math.round(performance.now() - preprocessStartedAt);
    preprocessSteps = preprocessed.steps;
    preprocessedBlob = preprocessed.blob;
    orientedBlob = preprocessedBlob;

    handleProgress?.(0.2);

    const detectionStartedAt = performance.now();
    try {
      const detection = await worker.detect(preprocessedBlob);
      const orientation = detection.data.orientation_degrees ?? 0;
      detectionMs = Math.round(performance.now() - detectionStartedAt);

      if ([90, 180, 270].includes(orientation)) {
        orientedBlob = await rotateImageBlob(preprocessedBlob, orientation);
      }
    } catch {
      detectionMs = Math.round(performance.now() - detectionStartedAt);
      warnings.push("Orientation detection failed; continued without rotation.");
      orientedBlob = preprocessedBlob;
    }

    handleProgress?.(0.35);
    const preprocessedStartedAt = performance.now();
    const preprocessedRecognition = await worker.recognize(
      orientedBlob ?? preprocessedBlob ?? imageFile,
      {},
      { blocks: true, tsv: true },
    );
    preprocessedRecognizeMs = Math.round(
      performance.now() - preprocessedStartedAt,
    );
    const preprocessedLines = toOcrLines(preprocessedRecognition.data);

    handleProgress?.(0.75);
    const rawStartedAt = performance.now();
    const rawRecognition = await worker.recognize(imageFile, {}, { blocks: true, tsv: true });
    rawRecognizeMs = Math.round(performance.now() - rawStartedAt);
    const rawLines = toOcrLines(rawRecognition.data);

    handleProgress?.(0.82);
    let focusedBrandLines: OcrLine[] = [];
    try {
      const dimensions = await getImageDimensions(imageFile);
      const brandFocusRectangles = buildBrandFocusRectangles(
        dimensions.width,
        dimensions.height,
      );

      for (const rectangle of brandFocusRectangles) {
        const focusedRecognition = await worker.recognize(
          imageFile,
          { rectangle },
          { blocks: true, tsv: true },
        );
        const extractedFocusedLines = toOcrLines(focusedRecognition.data);
        focusedBrandLines = focusedBrandLines.concat(
          offsetFocusedLines(extractedFocusedLines, rectangle),
        );
      }
    } catch {
      warnings.push(
        "Brand-focused OCR crop passes failed; continued with standard OCR lines.",
      );
    }

    const preprocessedScore = scoreExtractionQuality(preprocessedLines);
    const rawScore = scoreExtractionQuality(rawLines);
    const selectedPipeline = preprocessedScore >= rawScore ? "preprocessed" : "raw";
    const selectedLines = mergeOcrLines(
      preprocessedLines,
      rawLines,
      focusedBrandLines,
    );

    if (preprocessedLines.length === 0 && rawLines.length === 0) {
      warnings.push(
        "OCR returned no detectable text lines from both preprocessed and raw pipelines.",
      );
    }

    if (selectedPipeline === "preprocessed" && rawLines.length > 0) {
      warnings.push(
        "Merged raw OCR lines with preprocessed lines to preserve potentially missed text regions.",
      );
    }
    if (focusedBrandLines.length > 0) {
      warnings.push(
        `Merged ${focusedBrandLines.length} brand-focused OCR lines from top-region crop passes.`,
      );
    }

    handleProgress?.(1);
    runResult = {
      lines: selectedLines,
      diagnostics: {
        totalOcrMs: Math.round(performance.now() - totalStartedAt),
        preprocessMs,
        preprocessSteps,
        detectionMs,
        preprocessedRecognizeMs,
        rawRecognizeMs,
        selectedPipeline,
        preprocessedLineCount: preprocessedLines.length,
        rawLineCount: rawLines.length,
        cleanupApplied: false,
        transientArtifactsCleared: [],
        warnings,
      },
    };

    return runResult;
  } finally {
    await worker.terminate();
    const transientArtifactsCleared = ["tesseract_worker"];
    if (preprocessedBlob) {
      transientArtifactsCleared.push("preprocessed_blob");
      preprocessedBlob = null;
    }
    if (orientedBlob) {
      transientArtifactsCleared.push("oriented_blob");
      orientedBlob = null;
    }

    if (runResult) {
      runResult.diagnostics.cleanupApplied = true;
      runResult.diagnostics.transientArtifactsCleared = transientArtifactsCleared;
    }
  }
};
