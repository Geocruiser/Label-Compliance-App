import { describe, expect, it } from "vitest";
import { parseApplicationJson } from "@/lib/schemas";
import type { FieldKey } from "@/lib/types";
import { verifyLabelLines } from "@/lib/verification";
import { REGRESSION_LAYOUT_CASES } from "../fixtures/regression-layout-cases";

describe("regression fixtures - edge-case layouts", () => {
  REGRESSION_LAYOUT_CASES.forEach((fixture) => {
    it(`handles ${fixture.id}`, () => {
      const application = parseApplicationJson(fixture.applicationJson);
      const results = verifyLabelLines(
        application,
        fixture.ocrLines,
        fixture.ocrTokens ?? [],
      );

      const statusMap = Object.fromEntries(
        results.map((fieldResult) => [fieldResult.field, fieldResult.status]),
      );
      const resultByField = Object.fromEntries(
        results.map((fieldResult) => [fieldResult.field, fieldResult]),
      );

      Object.entries(fixture.expectedStatuses).forEach(([field, expectedStatus]) => {
        expect(statusMap[field as FieldKey]).toBe(expectedStatus);
      });

      if (fixture.expectedEvidence) {
        Object.entries(fixture.expectedEvidence).forEach(([field, expectations]) => {
          const fieldKey = field as FieldKey;
          const result = resultByField[fieldKey];
          expect(result).toBeDefined();

          if (expectations?.maxAreaRatio !== undefined) {
            expect(result.evidenceBoxAreaRatio ?? 0).toBeLessThanOrEqual(
              expectations.maxAreaRatio,
            );
          }

          if (expectations?.maxHeight !== undefined && result.evidenceBox) {
            expect(result.evidenceBox.y1 - result.evidenceBox.y0).toBeLessThanOrEqual(
              expectations.maxHeight,
            );
          }

          if (expectations?.maxWidth !== undefined && result.evidenceBox) {
            expect(result.evidenceBox.x1 - result.evidenceBox.x0).toBeLessThanOrEqual(
              expectations.maxWidth,
            );
          }

          if (expectations?.forbiddenSubstring) {
            expect(result.extractedValue).not.toContain(expectations.forbiddenSubstring);
          }

          if (expectations?.allowedSources) {
            expect(expectations.allowedSources).toContain(result.evidenceSource ?? "none");
          }
        });
      }
    });
  });
});
