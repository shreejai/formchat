import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { insertSubmission } from "@/lib/db/outbox";
import { verifyDescribeToken } from "@/lib/describe-token";
import { toSubmission } from "@/lib/flow";
import { error, readBody } from "@/lib/http";
import { deliver } from "@/lib/outbox/deliver";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { buildTurns, cleanAttempts, contactOf } from "@/lib/submit/transcript";
import { validateAnswers } from "@/lib/submit/validate";

const schema = nagpurhomes;
const EVENT_TYPE = "lead.submitted";

/** Answers plus up to 20 attempts of 2000 characters each, with room to spare. */
const MAX_BODY_BYTES = 256_000;

const SubmitRequest = z.object({
  conversationId: z.uuid(),
  answers: z.record(z.string(), z.unknown()),
  pdescToken: z.string().regex(/^[0-9a-f]{64}$/),
  needsReview: z.boolean(),
  costUsd: z.number().nonnegative().finite(),
  // Untrusted analytics, cleaned separately; a bad value never fails the submit.
  attempts: z.unknown().optional(),
});

const invalid = "Some answers are missing or invalid. Please check them and try again.";

/** Like the contract example: seconds, no milliseconds. */
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Validates a finished conversation, writes the redacted transcript and its outbox row in one
 * statement, replies, then tries delivery in the background. The drain retries what fails.
 */
export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(`submit:${clientIp(request.headers)}`)) {
    return error(429, "Too many requests. Please wait a minute and try again.");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return error(413, "Request too large.");
  }
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return error(413, "Request too large.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Invalid request.");
  }
  const parsed = SubmitRequest.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request.");
  const { conversationId, pdescToken, needsReview, costUsd } = parsed.data;

  const check = validateAnswers(schema, parsed.data.answers);
  if (!check.ok) return Response.json({ error: invalid, reason: check.reason }, { status: 422 });
  const { answers } = check;

  // The description must be the html /api/describe accepted for this conversation, with its
  // review flag and cost unchanged. Otherwise the AI checks could be skipped.
  let verified: boolean;
  try {
    verified = verifyDescribeToken(
      { conversationId, html: String(answers.pdesc), needsReview, costUsd },
      pdescToken,
    );
  } catch {
    console.error("submit: DESCRIBE_TOKEN_SECRET is not set");
    return error(500, "Something went wrong. Please try again.");
  }
  if (!verified) return Response.json({ error: invalid, reason: "invalid:pdesc" }, { status: 422 });

  const eventId = randomUUID();
  const payload = {
    event_id: eventId,
    event_type: EVENT_TYPE,
    schema_version: 1,
    tenant: schema.id,
    occurred_at: nowIso(),
    lead: toSubmission(schema, answers),
    meta: { conversation_id: conversationId, needs_review: needsReview, ai_cost_usd: costUsd },
  };

  let row;
  try {
    row = await insertSubmission({
      eventId,
      eventType: EVENT_TYPE,
      payload,
      conversationId,
      tenant: schema.id,
      turns: buildTurns(schema, answers),
      attempts: cleanAttempts(parsed.data.attempts, contactOf(schema, answers)),
      needsReview,
      aiCostUsd: costUsd,
    });
  } catch {
    // No body or error text here: either could carry the user's details.
    console.error(`submit: could not save conversation ${conversationId}`);
    return error(500, "We couldn't save your listing. Please try again.");
  }
  if (!row) return Response.json({ status: "duplicate" });

  const saved = row;
  after(async () => {
    await deliver(saved);
  });
  return Response.json({ status: "received" });
}
