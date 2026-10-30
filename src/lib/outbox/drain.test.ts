import { describe, expect, it, vi } from "vitest";
import type { OutboxRow } from "@/lib/db/outbox";
import type { DeliveryResult } from "./deliver";
import { DRAIN_BATCH, drainOutbox } from "./drain";
import type { Outcome } from "./retry";

const rows: OutboxRow[] = Array.from({ length: 5 }, (_, i) => ({ id: `row-${i}`, payload: {}, attempts: 0 }));

const ok: DeliveryResult = {
  outcome: { kind: "response", status: 200 },
  update: { status: "delivered", attempts: 1, nextAttemptAt: null, statusCode: 200, error: null },
};
const retry = (outcome: Outcome): DeliveryResult => ({
  outcome,
  update: { status: "pending", attempts: 1, nextAttemptAt: new Date(), statusCode: null, error: "x" },
});
const failed: DeliveryResult = {
  outcome: { kind: "response", status: 422 },
  update: { status: "failed", attempts: 1, nextAttemptAt: null, statusCode: 422, error: "HTTP 422" },
};

const claim = vi.fn(async () => rows);

describe("drainOutbox", () => {
  it("claims a batch of 20 and counts each result", async () => {
    const results = [ok, retry({ kind: "response", status: 503 }), failed, ok, ok];
    const deliverRow = vi.fn(async () => results.shift() as DeliveryResult);
    expect(await drainOutbox({ claim, deliverRow })).toEqual({
      claimed: 5,
      delivered: 3,
      retrying: 1,
      failed: 1,
      skipped: 0,
    });
    expect(claim).toHaveBeenCalledWith(DRAIN_BATCH);
    expect(DRAIN_BATCH).toBe(20);
  });

  it.each<[string, Outcome]>([
    ["timeout", { kind: "timeout" }],
    ["network error", { kind: "network", error: "ECONNREFUSED" }],
  ])("stops the batch at the first %s", async (_, outcome) => {
    const results = [ok, retry(outcome), ok, ok, ok];
    const deliverRow = vi.fn<(row: OutboxRow) => Promise<DeliveryResult>>(
      async () => results.shift() as DeliveryResult,
    );
    expect(await drainOutbox({ claim, deliverRow })).toEqual({
      claimed: 5,
      delivered: 1,
      retrying: 1,
      failed: 0,
      skipped: 3,
    });
    // Rows 3–5 are never attempted, so their attempts aren't touched.
    expect(deliverRow).toHaveBeenCalledTimes(2);
    expect(deliverRow.mock.calls.map(([row]) => row.id)).toEqual(["row-0", "row-1"]);
  });

  it("keeps going after a 5xx, which says the service is up", async () => {
    const deliverRow = vi.fn(async () => retry({ kind: "response", status: 503 }));
    expect((await drainOutbox({ claim, deliverRow })).retrying).toBe(5);
  });

  it("stops when unconfigured, without counting an attempt", async () => {
    const deliverRow = vi.fn(async (): Promise<DeliveryResult> => ({ outcome: { kind: "unconfigured" }, update: null }));
    expect(await drainOutbox({ claim, deliverRow })).toMatchObject({ delivered: 0, retrying: 0, skipped: 5 });
    expect(deliverRow).toHaveBeenCalledTimes(1);
  });

  it("skips the rest once another attempt could run past 45 s", async () => {
    let clock = 0;
    const deliverRow = vi.fn(async () => {
      clock += 15_000; // each delivery takes 15 s
      return ok;
    });
    // 0 s, 15 s and 30 s can start (30 + 10 ≤ 45); at 45 s there's no room for a 10 s attempt.
    expect(await drainOutbox({ claim, deliverRow, now: () => clock })).toEqual({
      claimed: 5,
      delivered: 3,
      retrying: 0,
      failed: 0,
      skipped: 2,
    });
    expect(deliverRow).toHaveBeenCalledTimes(3);
  });

  it("handles an empty outbox", async () => {
    const deliverRow = vi.fn();
    expect(await drainOutbox({ claim: async () => [], deliverRow })).toEqual({
      claimed: 0,
      delivered: 0,
      retrying: 0,
      failed: 0,
      skipped: 0,
    });
    expect(deliverRow).not.toHaveBeenCalled();
  });
});
