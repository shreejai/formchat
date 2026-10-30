import { describe, expect, it } from "vitest";
import { backoffMinutes, MAX_ATTEMPTS, nextState } from "./retry";

const NOW = new Date("2026-10-30T08:00:00Z");
const minutesLater = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("nextState", () => {
  it.each([200, 201, 204])("marks %i delivered", (status) => {
    expect(nextState(0, { kind: "response", status }, NOW)).toEqual({
      status: "delivered",
      attempts: 1,
      nextAttemptAt: null,
      statusCode: status,
      error: null,
    });
  });

  it.each([500, 502, 503, 429])("retries %i with backoff and records the code", (status) => {
    expect(nextState(0, { kind: "response", status }, NOW)).toEqual({
      status: "pending",
      attempts: 1,
      nextAttemptAt: minutesLater(1),
      statusCode: status,
      error: `HTTP ${status}`,
    });
  });

  it("retries a timeout", () => {
    expect(nextState(2, { kind: "timeout" }, NOW)).toMatchObject({
      status: "pending",
      attempts: 3,
      nextAttemptAt: minutesLater(4),
      statusCode: null,
      error: "timeout",
    });
  });

  it("retries a network error", () => {
    expect(nextState(0, { kind: "network", error: "ECONNREFUSED" }, NOW)).toMatchObject({
      status: "pending",
      attempts: 1,
      statusCode: null,
      error: "ECONNREFUSED",
    });
  });

  it.each([400, 401, 403, 404, 409, 422])("fails %i straight away and records the code", (status) => {
    expect(nextState(0, { kind: "response", status }, NOW)).toEqual({
      status: "failed",
      attempts: 1,
      nextAttemptAt: null,
      statusCode: status,
      error: `HTTP ${status}`,
    });
  });

  it("fails on the 10th failed attempt", () => {
    expect(nextState(MAX_ATTEMPTS - 2, { kind: "response", status: 503 }, NOW).status).toBe("pending");
    expect(nextState(MAX_ATTEMPTS - 1, { kind: "response", status: 503 }, NOW)).toMatchObject({
      status: "failed",
      attempts: MAX_ATTEMPTS,
      nextAttemptAt: null,
      statusCode: 503,
    });
    expect(nextState(MAX_ATTEMPTS - 1, { kind: "timeout" }, NOW).status).toBe("failed");
  });

  it("still delivers on the last attempt", () => {
    expect(nextState(MAX_ATTEMPTS - 1, { kind: "response", status: 200 }, NOW).status).toBe("delivered");
  });
});

describe("backoffMinutes", () => {
  it("doubles from 1 minute and caps at 60", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(backoffMinutes)).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
  });
});
