/**
 * LLM evals against the real API. Costs money: run deliberately with `npm run eval`.
 * Prints pass rates and total cost, writes evals/results/latest.json, and fails if the
 * classifier is below 90% or any injection case fails.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, expect, it, vi } from "vitest";
import { classify } from "@/lib/ai/classify";
import { setOpenAI } from "@/lib/ai/client";
import { extract } from "@/lib/ai/extract";
import {
  classifierVerdict,
  parseJsonl,
  passRate,
  scoreClassification,
  scoreExtraction,
  type CaseResult,
  type ClassifierCase,
  type ExtractorCase,
} from "./score";

const CONCURRENCY = 4;

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
  setOpenAI(null);
  // The client logs a line per call; the summary below is what matters here.
  vi.spyOn(console, "info").mockImplementation(() => {});
});

it("classifier and extractor evals", async () => {
  let totalCost = 0;

  // A fresh conversation per case, so the per-conversation token cap doesn't interfere.
  const classifier = await mapPool(load<ClassifierCase>("./classifier.jsonl"), async (c) => {
    const { result, costUsd } = await classify(randomUUID(), c.text);
    totalCost += costUsd;
    return scoreClassification(c, result.ok ? result.data.label : null);
  });

  const extractor = await mapPool(load<ExtractorCase>("./extractor.jsonl"), async (c) => {
    const { result, costUsd } = await extract(randomUUID(), c.text);
    totalCost += costUsd;
    return scoreExtraction(c, result.ok ? result.data : null);
  });

  const classifierRate = summarise("classifier", classifier);
  const extractorRate = summarise("extractor", extractor);
  const verdict = classifierVerdict(classifier);
  console.log(`\ntotal cost: $${totalCost.toFixed(6)}`);
  for (const failure of verdict.failures) console.log(`FAIL: ${failure}`);

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
      },
      null,
      2,
    )}\n`,
  );

  expect(verdict.failures).toEqual([]);
});
