import { z } from "zod";
import { describeReask } from "@/lib/ai/messages";
import { runDescribePipeline } from "@/lib/ai/pipeline";
import type { DescribeResult } from "@/lib/describe";
import { describeTokenConfigured, signDescribeToken } from "@/lib/describe-token";
import { error, readBody } from "@/lib/http";
import { allowRequest, clientIp } from "@/lib/rate-limit";

/**
 * The only size limit here. Text length is left to the prefilter, which re-asks with the
 * friendly "too long" message (no model call), so a long paste never dead-ends on a 400.
 */
const MAX_BODY_BYTES = 32_000;

const DescribeRequest = z.object({
  conversationId: z.uuid(),
  text: z.string(),
});

/** Checks a property description. Returns accepted / reask / blocked from the pipeline. */
export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(clientIp(request.headers))) {
    return error(429, "Too many messages. Please wait a minute and try again.");
  }
  // Fast path; readBody enforces the same limit when there's no Content-Length.
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return error(413, describeReask.too_long);
  }
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return error(413, describeReask.too_long);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Invalid request.");
  }
  const parsed = DescribeRequest.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request.");

  // Checked before the paid AI calls: without the secret an accepted result can't be signed.
  if (!describeTokenConfigured()) {
    console.error("describe: DESCRIBE_TOKEN_SECRET is not set");
    return error(500, "Something went wrong. Please try again.");
  }

  const { conversationId } = parsed.data;
  const check = await runDescribePipeline(conversationId, parsed.data.text);
  if (check.status !== "accepted") return Response.json(check);
  // Submit only accepts a description that carries this token, so the AI checks can't be skipped.
  const result: DescribeResult = {
    ...check,
    pdescToken: signDescribeToken({
      conversationId,
      html: check.html,
      needsReview: check.needsReview,
      costUsd: check.costUsd,
    }),
  };
  return Response.json(result);
}
