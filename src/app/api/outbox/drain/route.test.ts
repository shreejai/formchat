import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drainOutbox } from "@/lib/outbox/drain";
import { maxDuration, POST } from "./route";

vi.mock("@/lib/outbox/drain", () => ({ drainOutbox: vi.fn() }));

const drain = vi.mocked(drainOutbox);
const counts = { claimed: 2, delivered: 1, retrying: 1, failed: 0, skipped: 0 };

const post = (headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/outbox/drain", { method: "POST", headers }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-test-secret");
  drain.mockResolvedValue(counts);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  drain.mockReset();
});

describe("POST /api/outbox/drain", () => {
  it("drains and returns counts with the right secret", async () => {
    const response = await post({ authorization: "Bearer cron-test-secret" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no header", {}],
    ["a wrong secret", { authorization: "Bearer nope" }],
    ["the secret without Bearer", { authorization: "cron-test-secret" }],
    ["a longer secret", { authorization: "Bearer cron-test-secret-and-more" }],
  ])("returns 401 for %s", async (_, headers) => {
    expect((await post(headers)).status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });

  it("returns 401 for everyone when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await post({ authorization: "Bearer " })).status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });

  it("returns 500 when claiming fails", async () => {
    drain.mockRejectedValue(new Error("db down"));
    expect((await post({ authorization: "Bearer cron-test-secret" })).status).toBe(500);
  });

  it("allows up to 60 s", () => {
    expect(maxDuration).toBe(60);
  });
});
