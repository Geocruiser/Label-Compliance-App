import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { summarizeDurations } from "../src/lib/performance";
import { parseApplicationJson } from "../src/lib/schemas";
import { verifyLabelLines } from "../src/lib/verification";
import { ACCEPTANCE_FIXTURES } from "../tests/fixtures/acceptance-cases";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);
const workspaceRootPath = resolve(currentDirectoryPath, "..");
const requestedIterations = Number(process.argv[2] ?? "200");
const iterations = Number.isFinite(requestedIterations)
  ? Math.max(1, Math.floor(requestedIterations))
  : 200;

const formsByFixture = ACCEPTANCE_FIXTURES.map((fixture) => {
  const formPath = resolve(workspaceRootPath, fixture.formPath);
  const formJson = JSON.parse(readFileSync(formPath, "utf8")) as unknown;
  return {
    id: fixture.id,
    application: parseApplicationJson(formJson),
    ocrLines: fixture.ocrLines,
  };
});

const durationsMs: number[] = [];

for (let iterationIndex = 0; iterationIndex < iterations; iterationIndex += 1) {
  for (const fixture of formsByFixture) {
    const startedAt = performance.now();
    verifyLabelLines(fixture.application, fixture.ocrLines);
    const endedAt = performance.now();
    durationsMs.push(endedAt - startedAt);
  }
}

const summary = summarizeDurations(durationsMs);
const p95TargetMs = 5000;

console.log("Verification Core Benchmark (deterministic fixture OCR)");
console.log(`Samples: ${summary.sampleSize}`);
console.log(`Iterations per fixture: ${iterations}`);
console.log(`Average: ${summary.averageMs?.toFixed(3) ?? "N/A"} ms`);
console.log(`p50: ${summary.p50Ms?.toFixed(3) ?? "N/A"} ms`);
console.log(`p95: ${summary.p95Ms?.toFixed(3) ?? "N/A"} ms`);
console.log(`Min: ${summary.minMs?.toFixed(3) ?? "N/A"} ms`);
console.log(`Max: ${summary.maxMs?.toFixed(3) ?? "N/A"} ms`);
console.log(`Target (end-to-end guideline): <= ${p95TargetMs} ms`);

if (summary.p95Ms !== null && summary.p95Ms > p95TargetMs) {
  process.exitCode = 1;
  console.error(
    "p95 exceeded 5s target in verification-core benchmark. Investigate runtime hotspots.",
  );
}
