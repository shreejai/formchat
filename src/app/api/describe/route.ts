import { z } from "zod";
import { describeReask } from "@/lib/ai/messages";
import { runDescribePipeline } from "@/lib/ai/pipeline";
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

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * The body as text, or null once it passes `maxBytes`. Counted while streaming, because a
 * chunked request has no Content-Length and request.json() would buffer all of it.
 */
async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

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

  const result = await runDescribePipeline(parsed.data.conversationId, parsed.data.text);
  return Response.json(result);
}
