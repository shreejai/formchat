import "server-only";
import type { DescribeCheck } from "@/lib/describe";
import { toParagraphHtml } from "@/lib/html";
import { classify, type ClassifyOutcome } from "./classify";
import type { AiFailure } from "./client";
import { extract } from "./extract";
import { describeBlocked, describeReask, type ReaskReason } from "./messages";
import { moderate } from "./moderate";
import { prefilter } from "./prefilter";

function reask(reason: ReaskReason): DescribeCheck {
  return { status: "reask", message: describeReask[reason] };
}

function reaskForFailure(reason: Exclude<AiFailure, "budget_exceeded">): DescribeCheck {
  return reask(reason === "could_not_understand" ? "could_not_understand" : "unavailable");
}

/** Independent classifier votes per description. */
export const CLASSIFY_VOTES = 2;

type Decision = { accept: true; budgetExceeded: boolean } | { accept: false; result: DescribeCheck };

/**
 * Accepting needs every vote to say answer or partial_answer, so one lucky "answer" on an
 * injection isn't enough. Votes that all agree on another label get that label's handling;
 * any other disagreement re-asks, which publishes nothing.
 */
function decide(votes: ClassifyOutcome["result"][]): Decision {
  if (votes.every((v) => !v.ok && v.reason === "budget_exceeded")) {
    return { accept: true, budgetExceeded: true };
  }
  for (const v of votes) {
    if (!v.ok && v.reason !== "budget_exceeded") {
      return { accept: false, result: reaskForFailure(v.reason) };
    }
  }
  const labels = votes.map((v) => (v.ok ? v.data.label : null));
  if (labels.every((l) => l === "answer" || l === "partial_answer")) {
    return { accept: true, budgetExceeded: false };
  }
  const [first] = labels;
  if (labels.every((l) => l === first)) {
    switch (first) {
      case "abuse_or_injection":
        return { accept: false, result: { status: "blocked", message: describeBlocked.abuse_or_injection } };
      case "off_topic":
      case "question_about_process":
        return { accept: false, result: reask(first) };
    }
  }
  return { accept: false, result: reask("could_not_understand") };
}

/**
 * prefilter → classify (two votes) → (answer or partial) moderate + extract. Cheapest checks first.
 * When the token budget is used up, classify and extract are skipped, moderation (free) still
 * runs, and the description is accepted with needsReview.
 */
export async function runDescribePipeline(
  conversationId: string,
  input: string,
): Promise<DescribeCheck> {
  const pre = prefilter(input);
  if (!pre.ok) {
    if ("block" in pre) return { status: "blocked", message: describeBlocked[pre.block] };
    return reask(pre.reason);
  }
  const text = pre.text;

  // In parallel, so the second vote adds cost but not latency.
  const votes = await Promise.all(
    Array.from({ length: CLASSIFY_VOTES }, () => classify(conversationId, text)),
  );
  let costUsd = votes.reduce((sum, v) => sum + v.costUsd, 0);
  const decision = decide(votes.map((v) => v.result));
  if (!decision.accept) return decision.result;
  const { budgetExceeded } = decision;

  // Moderation and extraction are independent, so they run together. Extraction is wasted
  // only when moderation flags the text, which is rare.
  const [moderation, extracted] = await Promise.all([
    moderate(conversationId, text),
    budgetExceeded ? null : extract(conversationId, text),
  ]);
  if (!moderation.ok) return reask("unavailable");
  if (moderation.flagged) return { status: "blocked", message: describeBlocked.flagged };

  costUsd += extracted?.costUsd ?? 0;
  const extraction = extracted?.result.ok ? extracted.result.data : null;
  return {
    status: "accepted",
    html: toParagraphHtml(text),
    suggestedTitle: extraction?.suggestedTitle || null,
    highlights: extraction?.highlights ?? [],
    costUsd,
    needsReview: budgetExceeded,
  };
}
