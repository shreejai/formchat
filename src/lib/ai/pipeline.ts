import "server-only";
import type { DescribeResult } from "@/lib/describe";
import { toParagraphHtml } from "@/lib/html";
import { classify } from "./classify";
import type { AiFailure } from "./client";
import { extract } from "./extract";
import { describeBlocked, describeReask, type ReaskReason } from "./messages";
import { moderate } from "./moderate";
import { prefilter } from "./prefilter";

function reask(reason: ReaskReason): DescribeResult {
  return { status: "reask", message: describeReask[reason] };
}

function reaskForFailure(reason: Exclude<AiFailure, "budget_exceeded">): DescribeResult {
  return reask(reason === "could_not_understand" ? "could_not_understand" : "unavailable");
}

/**
 * prefilter → classify → (answer or partial) moderate + extract. Cheapest checks first.
 * When the token budget is used up, classify and extract are skipped, moderation (free) still
 * runs, and the description is accepted with needsReview.
 */
export async function runDescribePipeline(
  conversationId: string,
  input: string,
): Promise<DescribeResult> {
  const pre = prefilter(input);
  if (!pre.ok) {
    if ("block" in pre) return { status: "blocked", message: describeBlocked[pre.block] };
    return reask(pre.reason);
  }
  const text = pre.text;

  const classified = await classify(conversationId, text);
  const label = classified.result;
  let costUsd = classified.costUsd;

  if (!label.ok && label.reason !== "budget_exceeded") return reaskForFailure(label.reason);
  const budgetExceeded = !label.ok;
  if (label.ok) {
    switch (label.data.label) {
      case "abuse_or_injection":
        return { status: "blocked", message: describeBlocked.abuse_or_injection };
      case "off_topic":
      case "question_about_process":
        return reask(label.data.label);
    }
  }

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
