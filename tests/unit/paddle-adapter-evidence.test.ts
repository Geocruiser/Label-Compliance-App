import { describe, expect, it } from "vitest";
import { normalizePaddleOcrResponse } from "@/lib/paddle-normalize";
import { parseApplicationJson } from "@/lib/schemas";
import { verifyLabelLines } from "@/lib/verification";

describe("paddle adapter evidence quality", () => {
  it("prefers compact token evidence over broad line evidence", () => {
    const application = parseApplicationJson({
      cola_application_id: "PAD-REG-01",
      brand_name: "AMALFI COAST",
      class_type_designation: "GIN",
      alcohol_content: "44% ABV (88 PROOF)",
      net_contents: "750 ML",
      bottler_producer_name_address:
        "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
      is_imported: true,
      country_of_origin_import: "ITALY",
      government_health_warning_required: true,
    });

    const normalized = normalizePaddleOcrResponse({
      lines: [
        {
          text: "Distilled & Bottled By Luciana Spirits S.p.A., 8 Via dei Fiori, Amalfi, Italy",
          confidence: 0.95,
          bbox: { x0: 100, y0: 410, x1: 990, y1: 520 },
          line_id: "line_address",
        },
        {
          text: "AMALFI COAST",
          confidence: 0.91,
          bbox: { x0: 180, y0: 72, x1: 500, y1: 124 },
          line_id: "line_brand",
        },
        {
          text: "GIN",
          confidence: 0.92,
          bbox: { x0: 210, y0: 176, x1: 280, y1: 214 },
          line_id: "line_type",
        },
      ],
      tokens: [
        {
          text: "AMALFI",
          confidence: 0.93,
          bbox: { x0: 180, y0: 72, x1: 338, y1: 124 },
          line_id: "line_brand",
        },
        {
          text: "COAST",
          confidence: 0.9,
          bbox: { x0: 344, y0: 72, x1: 500, y1: 124 },
          line_id: "line_brand",
        },
        {
          text: "Distilled",
          confidence: 0.95,
          bbox: { x0: 100, y0: 410, x1: 210, y1: 520 },
          line_id: "line_address",
        },
      ],
      diagnostics: {
        model: "paddleocr",
        inference_ms: 99,
        warnings: [],
      },
    });

    const verification = verifyLabelLines(
      application,
      normalized.lines,
      normalized.tokens,
    );
    const brandResult = verification.find((field) => field.field === "brand_name");
    expect(brandResult).toBeDefined();
    expect(brandResult?.status).not.toBe("Missing");
    expect(brandResult?.evidenceSource).toBe("word");
    expect(brandResult?.extractedValue).not.toContain("Distilled");
    expect(brandResult?.evidenceBoxAreaRatio ?? 1).toBeLessThan(0.15);
  });
});
