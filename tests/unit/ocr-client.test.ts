import { afterEach, describe, expect, it, vi } from "vitest";
import { runLocalOcr } from "@/lib/ocr";

describe("ocr client adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls /api/ocr and returns normalized OCR output", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lines: [
          {
            text: "STEEL HAMMER",
            confidence: 0.9,
            bbox: { x0: 120, y0: 80, x1: 420, y1: 132 },
          },
        ],
        tokens: [
          {
            text: "STEEL",
            confidence: 0.9,
            bbox: { x0: 120, y0: 80, x1: 260, y1: 132 },
            line_id: "line_0",
          },
          {
            text: "HAMMER",
            confidence: 0.88,
            bbox: { x0: 268, y0: 80, x1: 420, y1: 132 },
            line_id: "line_0",
          },
        ],
        diagnostics: {
          model: "datalab_marker",
          inference_ms: 142,
          warnings: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const imageFile = new File(["mock-image"], "label.png", { type: "image/png" });
    const result = await runLocalOcr(imageFile);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ocr",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(result.lines).toHaveLength(1);
    expect(result.tokens).toHaveLength(2);
    expect(result.coordinateSpace).toEqual({
      x: 120,
      y: 80,
      width: 300,
      height: 52,
    });
    expect(result.diagnostics.model).toBe("datalab_marker");
    expect(result.diagnostics.cleanupApplied).toBe(true);
  });

  it("throws when OCR API returns an error payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "OCR service unavailable",
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const imageFile = new File(["mock-image"], "label.png", { type: "image/png" });
    await expect(runLocalOcr(imageFile)).rejects.toThrow("OCR service unavailable");
  });
});
