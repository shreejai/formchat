import { describe, expect, it, vi } from "vitest";
import { submitListing, submitUnavailable, type SubmitBody } from "./submit";

const body: SubmitBody = {
  conversationId: "0b7d1c3e-5a2f-4e8b-9c1d-2f3a4b5c6d7e",
  answers: { usertype: "owner" },
  pdescToken: "a".repeat(64),
  needsReview: false,
  costUsd: 0.0002,
  attempts: [{ key: "amount", text: "abc", outcome: "reask:no_number" }],
};

const reply = (data: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(data), { status }));

describe("submitListing", () => {
  it("posts the body as JSON", async () => {
    const fetchFn = reply({ status: "received" });
    await submitListing(body, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it.each(["received", "duplicate"])("treats %s as sent", async (status) => {
    expect(await submitListing(body, reply({ status }))).toEqual({ ok: true });
  });

  it.each([422, 429])("shows the server's message on %i", async (status) => {
    expect(await submitListing(body, reply({ error: "Check your answers." }, status))).toEqual({
      ok: false,
      message: "Check your answers.",
    });
  });

  it("names the field from a 422 invalid:<key> reason", async () => {
    const fetchFn = reply({ error: "Check your answers.", reason: "invalid:title" }, 422);
    expect(await submitListing(body, fetchFn)).toEqual({
      ok: false,
      message: "Check your answers.",
      field: "title",
    });
  });

  it.each([
    ["incomplete", 422],
    ["invalid:title", 429],
  ])("names no field for reason %s on %i", async (reason, status) => {
    const result = await submitListing(body, reply({ error: "x", reason }, status));
    expect(result).not.toHaveProperty("field");
  });

  it.each([
    ["a 500", reply({ error: "boom" }, 500)],
    ["an unexpected body", reply({ status: "weird" })],
    ["a non-JSON body", vi.fn(async () => new Response("<html>", { status: 200 }))],
    ["a network error", vi.fn(async () => Promise.reject(new TypeError("offline")))],
  ])("shows a generic message on %s", async (_, fetchFn) => {
    expect(await submitListing(body, fetchFn)).toEqual({ ok: false, message: submitUnavailable });
  });
});
