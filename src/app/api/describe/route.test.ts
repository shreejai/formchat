import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeReask } from "@/lib/ai/messages";
import { runDescribePipeline } from "@/lib/ai/pipeline";
import { allowRequest, clientIp, resetRateLimits } from "@/lib/rate-limit";
import { POST } from "./route";

vi.mock("@/lib/ai/pipeline", () => ({ runDescribePipeline: vi.fn() }));

const pipeline = vi.mocked(runDescribePipeline);
const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

function post(body: unknown, ip = "1.2.3.4", headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("http://localhost/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  resetRateLimits();
  pipeline.mockResolvedValue({ status: "reask", message: "again" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  pipeline.mockReset();
});

describe("POST /api/describe", () => {
  it("runs the pipeline and returns its result", async () => {
    const response = await post({ conversationId: ID, text: "2bhk flat in Dharampeth" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "reask", message: "again" });
    expect(pipeline).toHaveBeenCalledWith(ID, "2bhk flat in Dharampeth");
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["missing text", { conversationId: ID }],
    ["non-uuid id", { conversationId: "abc", text: "hello there" }],
    ["text not a string", { conversationId: ID, text: 42 }],
  ])("returns 400 for %s", async (_, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("leaves long text to the prefilter, which re-asks instead of a dead-end 400", async () => {
    const text = "a".repeat(5000);
    expect((await post({ conversationId: ID, text })).status).toBe(200);
    expect(pipeline).toHaveBeenCalledWith(ID, text);
  });

  it("returns 413 with the too-long message for an oversized body", async () => {
    const body = JSON.stringify({ conversationId: ID, text: "a".repeat(40_000) });
    const response = await post(body, "1.2.3.4", { "content-length": String(body.length) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: describeReask.too_long });
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized chunked body with no Content-Length", async () => {
    const chunk = new TextEncoder().encode("a".repeat(16_000));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Endless unless the route stops reading.
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://localhost/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(10);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("rate-limits per IP", async () => {
    vi.stubEnv("DESCRIBE_RATE_LIMIT_PER_MIN", "2");
    const body = { conversationId: ID, text: "2bhk flat in Dharampeth" };
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(429);
    expect((await post(body, "5.6.7.8")).status).toBe(200);
    expect(pipeline).toHaveBeenCalledTimes(3);
  });
});

describe("allowRequest", () => {
  it("resets after a minute and defaults to 10 a minute", () => {
    for (let i = 0; i < 10; i++) expect(allowRequest("ip", 0)).toBe(true);
    expect(allowRequest("ip", 59_999)).toBe(false);
    expect(allowRequest("ip", 60_000)).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first forwarded address, then x-real-ip", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " 9.9.9.9 , 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
