import { describe, expect, it } from "vitest";
import { parseApplicationJson } from "@/lib/schemas";
import type { FieldKey } from "@/lib/types";
import { verifyLabelLines } from "@/lib/verification";
import { REGRESSION_LAYOUT_CASES } from "../fixtures/regression-layout-cases";

describe("regression fixtures - edge-case layouts", () => {
  REGRESSION_LAYOUT_CASES.forEach((fixture) => {
    it(`handles ${fixture.id}`, () => {
      const application = parseApplicationJson(fixture.applicationJson);
      const results = verifyLabelLines(application, fixture.ocrLines);

      const statusMap = Object.fromEntries(
        results.map((fieldResult) => [fieldResult.field, fieldResult.status]),
      );

      Object.entries(fixture.expectedStatuses).forEach(([field, expectedStatus]) => {
        expect(statusMap[field as FieldKey]).toBe(expectedStatus);
      });
    });
  });
});
