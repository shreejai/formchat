import { describe, expect, it } from "vitest";
import type { AnswerValue } from "@/forms/types";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { toSubmission } from "@/lib/flow";
import { mockUser } from "@/lib/mock-user";
import {
  answeredSections,
  chatReducer,
  chatView,
  initialChatState,
  type ChatAction,
  type ChatState,
} from "./state";

const run = (actions: ChatAction[], from: ChatState = initialChatState) =>
  actions.reduce((s, a) => chatReducer(nagpurhomes, s, a), from);

const answer = (key: string, value: AnswerValue): ChatAction => ({ type: "answer", key, value });

function askedKey(state: ChatState): string | undefined {
  const view = chatView(nagpurhomes, state);
  return view.mode === "ask" || view.mode === "edit" ? view.question.key : undefined;
}

const residentialUpToPrice: ChatAction[] = [
  answer("usertype", "owner"),
  answer("listingtype", "sell"),
  answer("ptype", "residential"),
  answer("loc", "Dharampeth"),
  answer("beds", "3"),
  answer("bath", "2"),
  answer("areatype", "builtup"),
  answer("areatxt", "1200 sq ft"),
  answer("amount", "45 lakh"),
];

const fullResidential: ChatAction[] = [
  ...residentialUpToPrice,
  answer("pdesc", "Corner flat near the park."),
  answer("title", "3BHK in Dharampeth"),
  answer("images", ["front.jpg", "kitchen.jpg"]),
  answer("contact", mockUser),
  answer("acceptTerms", "accept"),
];

describe("chatReducer", () => {
  it("starts at the first question in step 1", () => {
    const view = chatView(nagpurhomes, initialChatState);
    expect(view.mode).toBe("ask");
    if (view.mode !== "ask") return;
    expect(view.question.key).toBe("usertype");
    expect(view.section).toMatchObject({ number: 1, total: 4, title: "Property Details" });
  });

  it("moves forward as questions are answered", () => {
    const s = run([answer("usertype", "owner"), answer("listingtype", "rent")]);
    expect(askedKey(s)).toBe("ptype");
  });

  it("reports step 2 of 4 once in Location & Price", () => {
    const s = run(residentialUpToPrice.slice(0, 3));
    const view = chatView(nagpurhomes, s);
    expect(view.mode === "ask" && view.section).toMatchObject({
      number: 2,
      total: 4,
      title: "Location & Price",
    });
  });

  it("skipping areatype stores the default and never asks areatxt", () => {
    const s = run([
      ...residentialUpToPrice.slice(0, 6),
      { type: "skip", key: "areatype" },
    ]);
    expect(s.answers.areatype).toBe("unknown");
    expect(askedKey(s)).toBe("amount");
  });

  it("skipping an optional question without a default stores null", () => {
    const s = run([...residentialUpToPrice.slice(0, 4), { type: "skip", key: "beds" }]);
    expect(s.answers.beds).toBeNull();
    expect(askedKey(s)).toBe("bath");
  });

  it("ignores skip on a required question", () => {
    const s = run([{ type: "skip", key: "usertype" }]);
    expect(s).toBe(initialChatState);
  });

  it("ignores answers to hidden questions", () => {
    const s = run([answer("ptype", "plot"), answer("beds", "3")]);
    expect(Object.hasOwn(s.answers, "beds")).toBe(false);
  });

  it("editing ptype to plot drops beds and bath but keeps later answers", () => {
    const s = run([
      ...fullResidential,
      { type: "startEdit", key: "ptype" },
      answer("ptype", "plot"),
    ]);
    expect(s.answers).not.toHaveProperty("beds");
    expect(s.answers).not.toHaveProperty("bath");
    expect(s.answers.amount).toBe("45 lakh");
    expect(s.editingKey).toBeNull();
    expect(chatView(nagpurhomes, s).mode).toBe("review");
  });

  it("an edit that reveals a new question makes the flow ask it", () => {
    const plot = fullResidential.filter(
      (a) => a.type !== "answer" || !["beds", "bath"].includes(a.key),
    ).map((a) => (a.type === "answer" && a.key === "ptype" ? answer("ptype", "plot") : a));
    const done = run(plot);
    expect(chatView(nagpurhomes, done).mode).toBe("review");

    const s = run([{ type: "startEdit", key: "ptype" }, answer("ptype", "commercial")], done);
    expect(askedKey(s)).toBe("bath");
  });

  it("shows the current answer while editing", () => {
    const s = run([...residentialUpToPrice, { type: "startEdit", key: "loc" }]);
    const view = chatView(nagpurhomes, s);
    expect(view).toMatchObject({ mode: "edit", current: "Dharampeth" });
    expect(view.mode === "edit" && view.section.number).toBe(2);
  });

  it("cancelling an edit changes no answers", () => {
    const before = run(residentialUpToPrice);
    const after = run([{ type: "startEdit", key: "loc" }, { type: "cancelEdit" }], before);
    expect(after.answers).toEqual(before.answers);
    expect(askedKey(after)).toBe("pdesc");
  });

  it("ignores startEdit on unanswered or hidden questions", () => {
    const s = run([answer("usertype", "owner")]);
    expect(run([{ type: "startEdit", key: "title" }], s)).toBe(s);
    expect(run([{ type: "startEdit", key: "nope" }], s)).toBe(s);
  });

  it("submit only works when the flow is complete", () => {
    const partial = run([...residentialUpToPrice, { type: "submit" }]);
    expect(partial.submitted).toBe(false);

    const done = run([...fullResidential, { type: "submit" }]);
    const view = chatView(nagpurhomes, done);
    expect(view.mode).toBe("submitted");
  });

  it("editing after submit goes back to the chat, and reopen returns to review", () => {
    const done = run([...fullResidential, { type: "submit" }]);
    expect(chatView(nagpurhomes, run([{ type: "startEdit", key: "title" }], done)).mode).toBe(
      "edit",
    );
    expect(chatView(nagpurhomes, run([{ type: "reopen" }], done)).mode).toBe("review");
  });
});

describe("full walk-through", () => {
  it("produces a payload with raw price/area strings and the flattened mock contact", () => {
    const s = run([...fullResidential, { type: "submit" }]);
    const view = chatView(nagpurhomes, s);
    expect(view.mode).toBe("submitted");
    if (view.mode !== "submitted") return;
    expect(view.payload).toEqual({
      usertype: "owner",
      listingtype: "sell",
      ptype: "residential",
      loc: "Dharampeth",
      beds: "3",
      bath: "2",
      areatype: "builtup",
      areatxt: "1200 sq ft",
      amount: "45 lakh",
      pdesc: "Corner flat near the park.",
      title: "3BHK in Dharampeth",
      images: ["front.jpg", "kitchen.jpg"],
      name: mockUser.name,
      email: mockUser.email,
      phone: mockUser.phone,
    });
    expect(view.payload).toEqual(toSubmission(nagpurhomes, s.answers));
    expect(view.payload).not.toHaveProperty("acceptTerms");
  });
});

describe("answeredSections", () => {
  it("groups answered questions by section and skips empty sections", () => {
    const s = run(residentialUpToPrice.slice(0, 4));
    const groups = answeredSections(nagpurhomes, s.answers);
    expect(groups.map((g) => g.section.id)).toEqual(["property", "location-price"]);
    expect(groups[1].items.map((i) => i.question.key)).toEqual(["loc"]);
  });

  it("leaves out stale answers", () => {
    const groups = answeredSections(nagpurhomes, { ptype: "plot", beds: "3" });
    expect(groups.flatMap((g) => g.items.map((i) => i.question.key))).toEqual(["ptype"]);
  });
});
