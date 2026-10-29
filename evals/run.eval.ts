/**
 * LLM evals against the real API. Costs money: run deliberately with `npm run eval`.
 * Prints pass rates and total cost, writes evals/results/latest.json, and fails if the
 * classifier is below 90%, any injection case fails, or the full pipeline ever accepts an
 * injection case or rejects a genuine description.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, expect, it, vi } from "vitest";
import { classify } from "@/lib/ai/classify";
import { setOpenAI } from "@/lib/ai/client";
import { extract } from "@/lib/ai/extract";
import { runDescribePipeline } from "@/lib/ai/pipeline";
import { missingEnv } from "./env";
import {
  classifierVerdict,
  parseJsonl,
  passRate,
  PIPELINE_GENUINE_IDS,
  pipelineGenuineVerdict,
  pipelineInjectionVerdict,
  scoreClassification,
  scoreExtraction,
  scorePipelineAccepted,
  scorePipelineSafe,
  type CaseResult,
  type ClassifierCase,
  type ExtractorCase,
} from "./score";

const CONCURRENCY = 4;
const PIPELINE_RUNS = 3;

/** Sum of costUsd from the wrapper's ai_call log lines, for calls whose cost isn't returned. */
let loggedCostUsd = 0;

function load<T>(file: string): T[] {
  return parseJsonl<T>(readFileSync(new URL(file, import.meta.url), "utf8"));
}

/** Runs `fn` over `items` with a small worker pool, keeping input order. */
async function mapPool<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

function summarise(name: string, results: CaseResult[]) {
  const rate = passRate(results);
  console.log(`\n${name}: ${results.filter((r) => r.passed).length}/${results.length} (${(rate * 100).toFixed(1)}%)`);
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ✗ ${r.id}: got ${JSON.stringify(r.got)}${r.reason ? `, ${r.reason}` : ""}`);
  }
  return rate;
}

beforeAll(() => {
  const missing = missingEnv(process.env);
  if (missing.length) {
    throw new Error(
      `Missing env for evals: ${missing.join(", ")}. Set them in .env.local, or in CI as ` +
        "GitHub Actions repository variables (OPENAI_API_KEY as a secret). No API calls were made.",
    );
  }
  setOpenAI(null);
  // The client logs a line per call; the summary below is what matters here. Each line carries
  // that call's cost, which is the only way to count the pipeline's calls.
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    try {
      const event = JSON.parse(String(line)) as { event?: string; costUsd?: unknown };
      if (event.event === "ai_call" && typeof event.costUsd === "number") loggedCostUsd += event.costUsd;
    } catch {
      // Not a JSON log line.
    }
  });
});

it("classifier and extractor evals", async () => {
  let totalCost = 0;

  const classifierCases = load<ClassifierCase>("./classifier.jsonl");

  // A fresh conversation per case, so the per-conversation token cap doesn't interfere.
  const classifier = await mapPool(classifierCases, async (c) => {
    const { result, costUsd } = await classify(randomUUID(), c.text);
    totalCost += costUsd;
    return scoreClassification(c, result.ok ? result.data.label : null);
  });

  const extractor = await mapPool(load<ExtractorCase>("./extractor.jsonl"), async (c) => {
    const { result, costUsd } = await extract(randomUUID(), c.text);
    totalCost += costUsd;
    return scoreExtraction(c, result.ok ? result.data : null);
  });

  // Defence in depth: the whole pipeline (prefilter, classifier, moderation) must never accept
  // an injection case. Several runs per case, since model labels vary between calls. Blocked
  // and re-asked results carry no cost, so it's taken from the call log instead.
  const loggedBefore = loggedCostUsd;
  const pipeline = await mapPool(
    classifierCases.filter((c) => c.category === "injection"),
    async (c) => {
      const statuses: string[] = [];
      for (let run = 0; run < PIPELINE_RUNS; run++) {
        statuses.push((await runDescribePipeline(randomUUID(), c.text)).status);
      }
      return scorePipelineSafe(c, statuses);
    },
  );
  // The other half: genuine descriptions must get through, so a step that rejects everything
  // (e.g. misconfigured moderation) fails here instead of passing the injection check.
  const genuineIds: readonly string[] = PIPELINE_GENUINE_IDS;
  const genuine = await mapPool(
    classifierCases.filter((c) => genuineIds.includes(c.id)),
    async (c) => scorePipelineAccepted(c, (await runDescribePipeline(randomUUID(), c.text)).status),
  );
  const pipelineCost = loggedCostUsd - loggedBefore;
  totalCost += pipelineCost;

  const classifierRate = summarise("classifier", classifier);
  const extractorRate = summarise("extractor", extractor);
  const verdict = classifierVerdict(classifier);
  const pipelineVerdict = pipelineInjectionVerdict(pipeline);
  const genuineVerdict = pipelineGenuineVerdict(genuine);
  console.log(
    `\npipeline injection: ${pipeline.filter((r) => r.passed).length}/${pipeline.length} never accepted (${PIPELINE_RUNS} runs each)`,
  );
  for (const r of pipeline.filter((r) => !r.passed)) console.log(`  ✗ ${r.id}: got ${JSON.stringify(r.got)}`);
  console.log(`pipeline genuine: ${genuine.filter((r) => r.passed).length}/${genuine.length} accepted`);
  for (const r of genuine.filter((r) => !r.passed)) console.log(`  ✗ ${r.id}: got ${JSON.stringify(r.got)}`);
  console.log(`\ntotal cost: $${totalCost.toFixed(6)} (pipeline checks: $${pipelineCost.toFixed(6)})`);
  const failures = [...verdict.failures, ...pipelineVerdict.failures, ...genuineVerdict.failures];
  for (const failure of failures) console.log(`FAIL: ${failure}`);

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("./results/latest.json", import.meta.url),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        models: { small: process.env.OPENAI_MODEL_SMALL, large: process.env.OPENAI_MODEL_LARGE },
        totalCostUsd: totalCost,
        classifier: { passRate: classifierRate, verdict, results: classifier },
        extractor: { passRate: extractorRate, results: extractor },
        pipelineInjection: { runsPerCase: PIPELINE_RUNS, verdict: pipelineVerdict, results: pipeline },
        pipelineGenuine: { verdict: genuineVerdict, results: genuine },
        pipelineCostUsd: pipelineCost,
      },
      null,
      2,
    )}\n`,
  );

  expect(failures).toEqual([]);
});
