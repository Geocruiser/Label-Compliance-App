import { describe, expect, it } from "vitest";
import { normalizePaddleOcrResponse } from "@/lib/paddle-normalize";

describe("paddle response normalization", () => {
  it("normalizes lines, tokens, and diagnostics from paddle payload", () => {
    const normalized = normalizePaddleOcrResponse({
      lines: [
        {
          text: "AMALFI COAST",
          confidence: 0.92,
          bbox: { x0: 120, y0: 64, x1: 440, y1: 126 },
          line_id: "line_0",
        },
      ],
      tokens: [
        {
          text: "AMALFI",
          confidence: 0.93,
          bbox: { x0: 120, y0: 64, x1: 280, y1: 126 },
          line_id: "line_0",
        },
        {
          text: "COAST",
          confidence: 0.91,
          bbox: { x0: 288, y0: 64, x1: 440, y1: 126 },
          line_id: "line_0",
        },
      ],
      diagnostics: {
        model: "paddleocr",
        inference_ms: 153,
        warnings: [],
      },
    });

    expect(normalized.lines).toHaveLength(1);
    expect(normalized.tokens).toHaveLength(2);
    expect(normalized.lines[0].text).toBe("AMALFI COAST");
    expect(normalized.tokens[0].lineId).toBe("line_0");
    expect(normalized.diagnostics.model).toBe("paddleocr");
    expect(normalized.diagnostics.inferenceMs).toBe(153);
    expect(normalized.diagnostics.lineCount).toBe(1);
    expect(normalized.diagnostics.tokenCount).toBe(2);
  });

  it("honors explicit line/token counts when provided by diagnostics", () => {
    const normalized = normalizePaddleOcrResponse({
      lines: [
        {
          text: "GIN",
          confidence: 0.81,
          bbox: { x0: 10, y0: 20, x1: 60, y1: 42 },
          line_id: "line_0",
        },
      ],
      tokens: [
        {
          text: "GIN",
          confidence: 0.81,
          bbox: { x0: 10, y0: 20, x1: 60, y1: 42 },
          line_id: "line_0",
        },
      ],
      diagnostics: {
        model: "paddleocr",
        inferenceMs: 90,
        line_count: "8",
        tokenCount: 27,
      },
    });

    expect(normalized.diagnostics.lineCount).toBe(8);
    expect(normalized.diagnostics.tokenCount).toBe(27);
  });

  it("keeps OCR line polygons for diagnostics overlays", () => {
    const normalized = normalizePaddleOcrResponse({
      lines: [
        {
          text: "AMALFI COAST",
          confidence: 0.92,
          bbox: { x0: 120, y0: 64, x1: 440, y1: 126 },
          polygon: [
            [120, 92],
            [430, 68],
            [440, 126],
            [130, 150],
          ],
        },
      ],
      diagnostics: {
        model: "paddleocr",
        inference_ms: 153,
        warnings: [],
      },
    });

    expect(normalized.lines[0].polygon).toEqual([
      { x: 120, y: 92 },
      { x: 430, y: 68 },
      { x: 440, y: 126 },
      { x: 130, y: 150 },
    ]);
  });
});
