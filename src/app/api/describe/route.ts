import { z } from "zod";
import { runDescribePipeline } from "@/lib/ai/pipeline";
import { allowRequest, clientIp } from "@/lib/rate-limit";

/** Generous: the prefilter gives the friendly "too long" message at 2000 characters. */
const MAX_TEXT_LENGTH = 4000;
const MAX_BODY_BYTES = 32_000;

const DescribeRequest = z.object({
  conversationId: z.uuid(),
  text: z.string().max(MAX_TEXT_LENGTH),
});

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** Checks a property description. Returns accepted / reask / blocked from the pipeline. */
export async function POST(request: Request): Promise<Response> {
  if (!allowRequest(clientIp(request.headers))) {
    return error(429, "Too many messages. Please wait a minute and try again.");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return error(413, "That message is too long.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid request.");
  }
  const parsed = DescribeRequest.safeParse(body);
  if (!parsed.success) return error(400, "Invalid request.");

  const result = await runDescribePipeline(parsed.data.conversationId, parsed.data.text);
  return Response.json(result);
}
