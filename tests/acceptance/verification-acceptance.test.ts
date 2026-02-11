import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseApplicationJson } from "@/lib/schemas";
import { verifyLabelLines } from "@/lib/verification";
import { ACCEPTANCE_FIXTURES } from "../fixtures/acceptance-cases";

const WORKSPACE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("acceptance suite - provided test assets", () => {
  it("contains all expected test form and label assets", () => {
    ACCEPTANCE_FIXTURES.forEach((fixture) => {
      expect(existsSync(resolve(WORKSPACE_ROOT, fixture.formPath))).toBe(true);
      expect(existsSync(resolve(WORKSPACE_ROOT, fixture.labelPath))).toBe(true);
    });
  });

  ACCEPTANCE_FIXTURES.forEach((fixture) => {
    it(`produces deterministic statuses for ${fixture.id}`, () => {
      const rawForm = readFileSync(
        resolve(WORKSPACE_ROOT, fixture.formPath),
        "utf-8",
      );
      const parsedForm = JSON.parse(rawForm) as unknown;
      const application = parseApplicationJson(parsedForm);
      const verificationResult = verifyLabelLines(application, fixture.ocrLines);

      const statuses = Object.fromEntries(
        verificationResult.map((fieldResult) => [fieldResult.field, fieldResult.status]),
      );

      expect(statuses).toEqual(fixture.expectedStatuses);
    });
  });
});
