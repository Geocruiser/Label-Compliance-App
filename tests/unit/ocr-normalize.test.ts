import { describe, expect, it } from "vitest";
import { normalizeOcrResponse } from "@/lib/ocr-normalize";

describe("ocr response normalization", () => {
  it("normalizes lines, tokens, and diagnostics from direct OCR payload", () => {
    const normalized = normalizeOcrResponse({
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
        model: "datalab_marker",
        inference_ms: 153,
        warnings: [],
      },
    });

    expect(normalized.lines).toHaveLength(1);
    expect(normalized.tokens).toHaveLength(2);
    expect(normalized.lines[0].text).toBe("AMALFI COAST");
    expect(normalized.tokens[0].lineId).toBe("line_0");
    expect(normalized.diagnostics.model).toBe("datalab_marker");
    expect(normalized.diagnostics.inferenceMs).toBe(153);
    expect(normalized.diagnostics.lineCount).toBe(1);
    expect(normalized.diagnostics.tokenCount).toBe(2);
    expect(normalized.coordinateSpace).toEqual({
      x: 120,
      y: 64,
      width: 320,
      height: 62,
    });
  });

  it("honors explicit line/token counts when provided by diagnostics", () => {
    const normalized = normalizeOcrResponse({
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
        model: "datalab_marker",
        inferenceMs: 90,
        line_count: "8",
        tokenCount: 27,
      },
    });

    expect(normalized.diagnostics.lineCount).toBe(8);
    expect(normalized.diagnostics.tokenCount).toBe(27);
  });

  it("keeps OCR line polygons for diagnostics overlays", () => {
    const normalized = normalizeOcrResponse({
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
        model: "datalab_marker",
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

  it("extracts marker html blocks into lines and derives tokens", () => {
    const normalized = normalizeOcrResponse({
      status: "complete",
      runtime: 210,
      json: {
        children: [
          {
            block_type: "Page",
            bbox: [0, 0, 1536, 2304],
            html: "<h1>Entire Page</h1>",
            children: [
              {
                block_type: "SectionHeader",
                html: "<h1>AMALFI COAST</h1>",
                bbox: [120, 64, 440, 126],
              },
              {
                block_type: "Picture",
                html: "<img alt=\"Decorative image\" src=\"foo.jpg\"/>",
                bbox: [10, 10, 100, 100],
              },
              {
                block_type: "Text",
                html: "<p>45% Alc./Vol. (90 Proof)</p>",
                bbox: [399, 1428, 1081, 1516],
              },
            ],
          },
        ],
      },
    });

    expect(normalized.lines).toHaveLength(2);
    expect(normalized.lines[0].text).toBe("AMALFI COAST");
    expect(normalized.tokens.length).toBeGreaterThan(1);
    expect(normalized.lines.some((line) => line.text.includes("Decorative image"))).toBe(
      false,
    );
    expect(normalized.diagnostics.model).toBe("datalab_marker");
    expect(normalized.diagnostics.inferenceMs).toBe(210);
    expect(normalized.coordinateSpace).toEqual({
      x: 0,
      y: 0,
      width: 1536,
      height: 2304,
    });
  });
});
