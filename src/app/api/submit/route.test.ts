import { readFileSync } from "node:fs";
import { after } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerValue } from "@/forms/types";
import { insertSubmission, type NewSubmission } from "@/lib/db/outbox";
import { signDescribeToken } from "@/lib/describe-token";
import { deliver } from "@/lib/outbox/deliver";
import { resetRateLimits } from "@/lib/rate-limit";
import { POST } from "./route";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db/outbox", () => ({ insertSubmission: vi.fn() }));
vi.mock("@/lib/outbox/deliver", () => ({ deliver: vi.fn() }));

const insert = vi.mocked(insertSubmission);
const scheduled = vi.mocked(after);
const ID = "0b7d1c3e-5a2f-4e8b-9c1d-2f3a4b5c6d7e";
const HTML = "<p>Spacious 3 BHK near Futala lake. Call Rahul on 98765 43210.</p>";

const contact = { name: "Rahul Deshmukh", email: "rahul.d@example.com", phone: "+91 98765 43210" };

/** The contract example's lead, as chat answers. */
const answers: Record<string, AnswerValue> = {
  usertype: "owner",
  listingtype: "sell",
  ptype: "residential",
  loc: "Dharampeth",
  beds: "3",
  bath: "2",
  areatype: "builtup",
  areatxt: "1200",
  amount: "4500000",
  pdesc: HTML,
  title: "3 BHK Flat in Dharampeth",
  images: ["front.jpg"],
  contact,
  acceptTerms: "accept",
};

const contractBody = JSON.parse(
  /## Body\s+```json\n([\s\S]*?)\n```/.exec(
    readFileSync(new URL("../../../../docs/contracts/lead-webhook-v1.md", import.meta.url), "utf8"),
  )?.[1] ?? "{}",
);

function request(overrides: Record<string, unknown> = {}) {
  const claims = { conversationId: ID, html: HTML, needsReview: false, costUsd: 0.0002 };
  return {
    conversationId: ID,
    answers,
    pdescToken: signDescribeToken(claims),
    needsReview: claims.needsReview,
    costUsd: claims.costUsd,
    ...overrides,
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const without = (a: Record<string, AnswerValue>, key: string) =>
  Object.fromEntries(Object.entries(a).filter(([k]) => k !== key));

const saved = (): NewSubmission => insert.mock.calls[0][0];

beforeEach(() => {
  resetRateLimits();
  vi.stubEnv("DESCRIBE_TOKEN_SECRET", "describe-test-secret");
  vi.stubEnv("DESCRIBE_RATE_LIMIT_PER_MIN", "100");
  insert.mockImplementation(async (s) => ({ id: s.eventId, payload: s.payload, attempts: 0 }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  insert.mockReset();
  scheduled.mockReset();
  vi.mocked(deliver).mockReset();
});

describe("POST /api/submit", () => {
  it("stores the submission, replies, then delivers in the background", async () => {
    const response = await post(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "received" });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveBeenCalledTimes(1);
    expect(deliver).not.toHaveBeenCalled();
    await (scheduled.mock.calls[0][0] as () => Promise<void>)();
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ id: saved().eventId, attempts: 0 }));
  });

  it("builds a payload with the contract example's keys and value types", async () => {
    await post(request());
    const payload = saved().payload as typeof contractBody;
    expect(Object.keys(payload).sort()).toEqual(Object.keys(contractBody).sort());
    expect(Object.keys(payload.lead).sort()).toEqual(Object.keys(contractBody.lead).sort());
    expect(Object.keys(payload.meta).sort()).toEqual(Object.keys(contractBody.meta).sort());
    for (const [key, example] of Object.entries(contractBody.lead)) {
      if (Array.isArray(example)) {
        expect(payload.lead[key], key).toEqual(expect.arrayContaining([expect.any(String)]));
      } else {
        expect(typeof payload.lead[key], key).toBe("string");
      }
    }
    // The ones most likely to slip into numbers.
    expect(payload.lead).toMatchObject({ beds: "3", bath: "2", areatxt: "1200", amount: "4500000" });
    expect(payload).toMatchObject({
      event_id: saved().eventId,
      event_type: "lead.submitted",
      schema_version: 1,
      tenant: "nagpurhomes",
      meta: { conversation_id: ID, needs_review: false, ai_cost_usd: 0.0002 },
    });
    expect(payload.occurred_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(payload.lead).not.toHaveProperty("acceptTerms");
  });

  it("leaves skipped optional fields out and keeps areatype", async () => {
    const rest = without(answers, "areatxt");
    await post(request({ answers: { ...rest, beds: null, areatype: null, images: null } }));
    const lead = saved().payload.lead as Record<string, unknown>;
    expect(lead).not.toHaveProperty("beds");
    expect(lead).not.toHaveProperty("areatxt");
    expect(lead).not.toHaveProperty("images");
    expect(lead.areatype).toBe("unknown");
  });

  it("drops answers to hidden questions and unknown keys", async () => {
    await post(request({ answers: { ...answers, ptype: "plot", hacked: "<script>" } }));
    const lead = saved().payload.lead as Record<string, unknown>;
    expect(lead).not.toHaveProperty("beds");
    expect(lead).not.toHaveProperty("bath");
    expect(lead).not.toHaveProperty("hacked");
  });

  it("returns 422 for incomplete answers", async () => {
    const response = await post(request({ answers: without(answers, "contact") }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: "incomplete" });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>]>([
    ["an option that doesn't exist", { usertype: "admin" }],
    ["a price as a number", { amount: 4500000 }],
    ["an unparsed price", { amount: "45 lakh" }],
    ["a non-canonical price", { amount: "04500000" }],
    ["a price over the cap", { amount: "999999999999999" }],
    ["an area as a number", { areatxt: 1200 }],
    ["an unparsed area", { areatxt: "1200 sq ft" }],
    ["a zero area", { areatxt: "0" }],
    ["a skipped required question", { loc: null }],
    ["a bad email", { contact: { ...contact, email: "nope" } }],
    ["a short phone", { contact: { ...contact, phone: "123" } }],
    ["a contact that isn't an object", { contact: "Rahul" }],
    ["images that aren't strings", { images: [1, 2] }],
    ["an empty title", { title: "  " }],
  ])("returns 422 for %s", async (_, change) => {
    const response = await post(request({ answers: { ...answers, ...change } }));
    expect(response.status).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>]>([
    ["tampered pdesc", { answers: { ...answers, pdesc: "<p>Raw <b>html</b> that skipped the checks</p>" } }],
    ["flipped needsReview", { needsReview: true }],
    ["changed costUsd", { costUsd: 0 }],
    ["another conversation's token", { conversationId: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60" }],
    ["a made-up token", { pdescToken: "0".repeat(64) }],
  ])("rejects a %s", async (_, change) => {
    const response = await post(request(change));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: "invalid:pdesc" });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each<[string, () => unknown]>([
    ["invalid JSON", () => "{nope"],
    ["a non-uuid id", () => request({ conversationId: "abc" })],
    ["a missing token", () => request({ pdescToken: undefined })],
    ["a negative cost", () => request({ costUsd: -1 })],
  ])("returns 400 for %s", async (_, body) => {
    expect((await post(body())).status).toBe(400);
  });

  it("stores redacted turns with no raw name, email or phone", async () => {
    await post(request());
    const { turns } = saved();
    const all = JSON.stringify(turns);
    expect(all).not.toMatch(/Rahul|Deshmukh|rahul\.d@example\.com|98765/);
    expect(turns).toContainEqual({ role: "user", key: "contact", text: "[NAME] · [PHONE] · [EMAIL]" });
    expect(turns).toContainEqual({ role: "bot", key: "loc", text: "Location" });
    expect(turns).toContainEqual({ role: "user", key: "amount", text: "₹45,00,000" });
    expect(turns.find((t) => t.role === "user" && t.key === "pdesc")?.text).toBe(
      "Spacious 3 BHK near Futala lake. Call [NAME] on [PHONE].",
    );
  });

  it("works without attempts", async () => {
    await post(request());
    expect(saved().attempts).toEqual([]);
  });

  it("redacts and caps attempts", async () => {
    const attempts = Array.from({ length: 21 }, (_, i) => ({
      key: "pdesc",
      text: i === 0 ? `I am Rahul, mail rahul.d@example.com ${"x".repeat(3000)}` : `try ${i}`,
      outcome: "reask",
    }));
    await post(request({ attempts }));
    const stored = saved().attempts;
    expect(stored).toHaveLength(20);
    expect(stored[0].text.startsWith("I am [NAME], mail [EMAIL] ")).toBe(true);
    expect(stored[0].text.length).toBeLessThanOrEqual(2000);
    expect(stored[19].text).toBe("try 19");
  });

  it("drops malformed attempts without failing the submit", async () => {
    const response = await post(
      request({
        attempts: [
          { key: "amount", text: "45 lakhs?", outcome: "reask:range" },
          { key: "x", text: 42, outcome: "reask" },
          { key: "x", text: "y", outcome: "<script>" },
          "nope",
        ],
      }),
    );
    expect(response.status).toBe(200);
    expect(saved().attempts).toEqual([{ key: "amount", text: "45 lakhs?", outcome: "reask:range" }]);
  });

  it("ignores attempts that aren't an array", async () => {
    expect((await post(request({ attempts: "lots" }))).status).toBe(200);
    expect(saved().attempts).toEqual([]);
  });

  it("returns duplicate and doesn't deliver when the conversation was already submitted", async () => {
    insert.mockResolvedValue(null);
    const response = await post(request());
    expect(await response.json()).toEqual({ status: "duplicate" });
    expect(scheduled).not.toHaveBeenCalled();
  });

  it("returns 500 without logging the body when the database fails", async () => {
    insert.mockRejectedValue(new Error(`insert failed: ${HTML}`));
    const response = await post(request());
    expect(response.status).toBe(500);
    expect(scheduled).not.toHaveBeenCalled();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("Rahul");
  });

  it("returns 500 when the token secret is missing", async () => {
    const body = request();
    vi.stubEnv("DESCRIBE_TOKEN_SECRET", "");
    expect((await post(body)).status).toBe(500);
    expect(insert).not.toHaveBeenCalled();
  });
});
