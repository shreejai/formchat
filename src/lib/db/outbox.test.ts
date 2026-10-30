import { afterEach, describe, expect, it, vi } from "vitest";
import { getSql, setSql, type Row, type Sql } from "./client";
import { claimDue, insertSubmission, saveAttempt } from "./outbox";

function fakeSql(rows: Row[] = []) {
  const query = vi.fn<Sql["query"]>(async () => rows);
  setSql({ query });
  return query;
}

afterEach(() => {
  setSql(null);
  vi.unstubAllEnvs();
});

const submission = {
  eventId: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60",
  eventType: "lead.submitted",
  payload: { event_id: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60" },
  conversationId: "0b7d1c3e-5a2f-4e8b-9c1d-2f3a4b5c6d7e",
  tenant: "nagpurhomes",
  turns: [{ role: "bot" as const, key: "loc", text: "Location" }],
  attempts: [],
  needsReview: false,
  aiCostUsd: 0.0002,
};

describe("db client", () => {
  it("reads DATABASE_URL on first use, not at import", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(() => getSql()).toThrow(/DATABASE_URL/);
  });
});

describe("insertSubmission", () => {
  it("writes the transcript and outbox row in one statement", async () => {
    const query = fakeSql([{ id: submission.eventId, payload: submission.payload, attempts: 0 }]);
    const row = await insertSubmission(submission);
    expect(query).toHaveBeenCalledTimes(1);
    const [text, params] = query.mock.calls[0];
    expect(text).toMatch(/WITH t AS \(\s*INSERT INTO transcripts/);
    expect(text).toMatch(/ON CONFLICT \(conversation_id\) DO NOTHING/);
    expect(text).toMatch(/INSERT INTO outbox[\s\S]*FROM t/);
    expect(params).toContain(JSON.stringify(submission.turns));
    expect(row).toEqual({ id: submission.eventId, payload: submission.payload, attempts: 0 });
  });

  it("returns null for a conversation that was already submitted", async () => {
    fakeSql([]);
    expect(await insertSubmission(submission)).toBeNull();
  });
});

describe("claimDue", () => {
  it("leases due pending rows with SKIP LOCKED", async () => {
    const query = fakeSql([{ id: "a", payload: {}, attempts: "3" }]);
    expect(await claimDue(20)).toEqual([{ id: "a", payload: {}, attempts: 3 }]);
    const [text, params] = query.mock.calls[0];
    expect(text).toMatch(/status = 'pending' AND next_attempt_at <= now\(\)/);
    expect(text).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(params).toEqual([20]);
  });
});

describe("saveAttempt", () => {
  it("passes the update as parameters", async () => {
    const query = fakeSql();
    const at = new Date("2026-10-30T00:00:00Z");
    await saveAttempt("a", { status: "pending", attempts: 2, nextAttemptAt: at, statusCode: 503, error: "HTTP 503" });
    expect(query.mock.calls[0][1]).toEqual(["a", "pending", 2, at.toISOString(), 503, "HTTP 503"]);
  });
});
