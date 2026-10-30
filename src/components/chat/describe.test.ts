import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { describeAnswer, newConversationId } from "./describe";
import { describeUnavailable } from "./messages";

const ID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

function reply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("describeAnswer", () => {
  it("posts the text and conversation id", async () => {
    const fetchFn = reply({ status: "reask", message: "More please." });
    await describeAnswer("pdesc", "2bhk flat", ID, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: ID, text: "2bhk flat" }),
    });
  });

  it("maps accepted to describeAccepted", async () => {
    const fetchFn = reply({
      status: "accepted",
      html: "<p>2bhk flat</p>",
      suggestedTitle: "2 BHK Flat",
      highlights: [],
      costUsd: 0.0001,
      needsReview: false,
      pdescToken: "abc123",
    });
    expect(await describeAnswer("pdesc", "2bhk flat", ID, fetchFn)).toEqual({
      type: "describeAccepted",
      key: "pdesc",
      html: "<p>2bhk flat</p>",
      suggestedTitle: "2 BHK Flat",
      needsReview: false,
      pdescToken: "abc123",
      costUsd: 0.0001,
    });
  });

  it.each(["reask", "blocked"])("maps %s to describeRejected with its message", async (status) => {
    const fetchFn = reply({ status, message: "Nope." });
    expect(await describeAnswer("pdesc", "hi", ID, fetchFn)).toEqual({
      type: "describeRejected",
      key: "pdesc",
      input: "hi",
      message: "Nope.",
      outcome: status,
    });
  });

  it("shows the rate-limit message on 429", async () => {
    const fetchFn = reply({ error: "Too many messages." }, 429);
    expect(await describeAnswer("pdesc", "hi", ID, fetchFn)).toMatchObject({
      type: "describeRejected",
      message: "Too many messages.",
      outcome: "rate_limited",
    });
  });

  it("shows the too-long message on 413, since resending the same text can't help", async () => {
    const fetchFn = reply({ error: "That’s a bit long." }, 413);
    expect(await describeAnswer("pdesc", "hi", ID, fetchFn)).toMatchObject({
      type: "describeRejected",
      message: "That’s a bit long.",
      outcome: "too_long",
    });
  });

  it.each([
    ["a 500", reply({ error: "boom" }, 500)],
    ["an unexpected body", reply({ status: "accepted", html: 42 })],
    [
      "an accepted body without a token",
      reply({ status: "accepted", html: "<p>x</p>", suggestedTitle: null, costUsd: 0, needsReview: false }),
    ],
    ["a non-JSON body", vi.fn(async () => new Response("<html>", { status: 200 }))],
    ["a network error", vi.fn(async () => Promise.reject(new TypeError("offline")))],
  ])("re-asks on %s", async (_, fetchFn) => {
    expect(await describeAnswer("pdesc", "hi", ID, fetchFn)).toEqual({
      type: "describeRejected",
      key: "pdesc",
      input: "hi",
      message: describeUnavailable,
      outcome: "unavailable",
    });
  });
});

describe("newConversationId", () => {
  // The route only accepts a valid UUID.
  const isUuid = (id: string) => z.uuid().safeParse(id).success;

  it("uses crypto.randomUUID when it exists", () => {
    expect(newConversationId({ randomUUID: () => ID, getRandomValues: () => new Uint8Array(16) })).toBe(ID);
  });

  it("builds a valid v4 UUID without randomUUID, as on plain HTTP", () => {
    const source = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const ids = new Set(Array.from({ length: 50 }, () => newConversationId(source)));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(isUuid(id)).toBe(true);
      expect(id[14]).toBe("4");
    }
  });
});
