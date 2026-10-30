export function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/**
 * The body as text, or null once it passes `maxBytes`. Counted while streaming, because a
 * chunked request has no Content-Length and request.json() would buffer all of it.
 */
export async function readBody(request: Request, maxBytes: number): Promise<string | null> {
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
