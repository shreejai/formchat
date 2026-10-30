import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAttempt, type OutboxRow } from "@/lib/db/outbox";
import { deliver } from "./deliver";
import { signWebhook } from "./sign";

vi.mock("@/lib/db/outbox", () => ({ saveAttempt: vi.fn() }));

const save = vi.mocked(saveAttempt);
const NOW = Date.parse("2026-10-30T08:00:00Z");
const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const row: OutboxRow = {
  id: ID,
  payload: { event_id: ID, event_type: "lead.submitted", lead: { loc: "Dharampeth" } },
  attempts: 0,
};

const respond = (status: number) =>
  vi.fn<typeof fetch>(async () => new Response(status === 204 ? null : "{}", { status }));
const reject = (err: unknown) => vi.fn<typeof fetch>(async () => Promise.reject(err));

beforeEach(() => {
  vi.stubEnv("WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("LEADS_SERVICE_URL", "https://leads.example.com/");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  save.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  save.mockReset();
});

describe("deliver", () => {
  it("posts the signed payload per the contract", async () => {
    const fetchFn = respond(200);
    await deliver(row, { fetch: fetchFn, now: () => NOW });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://leads.example.com/webhooks/leads");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    const body = String(init?.body);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-formchat-event-id"]).toBe(ID);
    expect(JSON.parse(body).event_id).toBe(headers["x-formchat-event-id"]);
    expect(headers["x-formchat-timestamp"]).toBe(String(NOW / 1000));
    expect(headers["x-formchat-signature"]).toBe(signWebhook("test-secret", NOW / 1000, body));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("marks a 2xx delivered", async () => {
    const result = await deliver(row, { fetch: respond(204), now: () => NOW });
    expect(result.update?.status).toBe("delivered");
    expect(save).toHaveBeenCalledWith(ID, expect.objectContaining({ status: "delivered", attempts: 1 }));
  });

  it.each([500, 503, 429])("keeps %i pending with a 1 minute backoff", async (status) => {
    await deliver(row, { fetch: respond(status), now: () => NOW });
    expect(save).toHaveBeenCalledWith(ID, {
      status: "pending",
      attempts: 1,
      nextAttemptAt: new Date(NOW + 60_000),
      statusCode: status,
      error: `HTTP ${status}`,
    });
  });

  it("treats a timeout as retryable", async () => {
    const result = await deliver(row, {
      fetch: reject(new DOMException("timed out", "TimeoutError")),
      now: () => NOW,
    });
    expect(result.outcome).toEqual({ kind: "timeout" });
    expect(save).toHaveBeenCalledWith(ID, expect.objectContaining({ status: "pending", error: "timeout" }));
  });

  it("treats a network error as retryable and records its code", async () => {
    const err = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const result = await deliver(row, { fetch: reject(err), now: () => NOW });
    expect(result.outcome).toEqual({ kind: "network", error: "ECONNREFUSED" });
    expect(save).toHaveBeenCalledWith(ID, expect.objectContaining({ status: "pending", statusCode: null }));
  });

  it.each([400, 401, 422])("fails %i straight away", async (status) => {
    await deliver(row, { fetch: respond(status), now: () => NOW });
    expect(save).toHaveBeenCalledWith(ID, expect.objectContaining({ status: "failed", statusCode: status }));
  });

  it("fails after the 10th attempt", async () => {
    await deliver({ ...row, attempts: 9 }, { fetch: respond(503), now: () => NOW });
    expect(save).toHaveBeenCalledWith(ID, expect.objectContaining({ status: "failed", attempts: 10 }));
  });

  it("sends nothing and writes nothing when unconfigured", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "");
    const fetchFn = respond(200);
    const result = await deliver(row, { fetch: fetchFn });
    expect(result).toEqual({ outcome: { kind: "unconfigured" }, update: null });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("doesn't throw when saving the attempt fails", async () => {
    save.mockRejectedValue(new Error("db down"));
    await expect(deliver(row, { fetch: respond(200), now: () => NOW })).resolves.toMatchObject({
      update: { status: "delivered" },
    });
  });

  it("never logs the payload", async () => {
    await deliver(row, { fetch: respond(500), now: () => NOW });
    const logged = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logged).not.toContain("Dharampeth");
  });
});
