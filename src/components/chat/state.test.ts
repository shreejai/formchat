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

const accepted = (
  key: string,
  html: string,
  suggestedTitle: string | null = null,
  needsReview = false,
): ChatAction => ({ type: "describeAccepted", key, html, suggestedTitle, needsReview });

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
  { type: "confirmPrice" },
];

const fullResidential: ChatAction[] = [
  ...residentialUpToPrice,
  accepted("pdesc", "<p>Corner flat near the park.</p>"),
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
    expect(s.answers.amount).toBe("4500000");
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

describe("price and area parsing", () => {
  const upToAmount = residentialUpToPrice.slice(0, -2);
  const rentUpToAmount = upToAmount.map((a) =>
    a.type === "answer" && a.key === "listingtype" ? answer("listingtype", "rent") : a,
  );

  it("a parsed price asks for confirmation and stores nothing yet", () => {
    const s = run([...upToAmount, answer("amount", "45 lakh")]);
    expect(Object.hasOwn(s.answers, "amount")).toBe(false);
    expect(s.pendingPrice).toMatchObject({ value: 4_500_000, display: "₹45,00,000", sanity: null });
    expect(chatView(nagpurhomes, s)).toMatchObject({
      mode: "ask",
      pendingPrice: { input: "45 lakh", message: "That’s ₹45,00,000, correct?" },
    });
  });

  it("Yes stores the price as a plain digit string and moves on", () => {
    const s = run([...upToAmount, answer("amount", "₹45,00,000"), { type: "confirmPrice" }]);
    expect(s.answers.amount).toBe("4500000");
    expect(s.pendingPrice).toBeNull();
    expect(askedKey(s)).toBe("pdesc");
  });

  it("Change stores nothing and re-asks with a message", () => {
    const s = run([...upToAmount, answer("amount", "45 lakh"), { type: "changePrice" }]);
    expect(Object.hasOwn(s.answers, "amount")).toBe(false);
    expect(s.pendingPrice).toBeNull();
    expect(chatView(nagpurhomes, s)).toMatchObject({
      mode: "ask",
      question: { key: "amount" },
      notice: { message: "No problem. What should the price be?" },
    });
  });

  it("warns about a low sale price but still stores it on Yes", () => {
    const s = run([...upToAmount, answer("amount", "25k")]);
    expect(s.pendingPrice).toMatchObject({
      sanity: "sell_low",
      message: "That’s ₹25,000 for a sale. Is that right?",
    });
    expect(run([{ type: "confirmPrice" }], s).answers.amount).toBe("25000");
  });

  it("warns about a high rent but still stores it on Yes", () => {
    const s = run([...rentUpToAmount, answer("amount", "15 lakh")]);
    expect(s.pendingPrice).toMatchObject({
      sanity: "rent_high",
      message: "That’s ₹15,00,000 a month for rent. Is that right?",
    });
    expect(run([{ type: "confirmPrice" }], s).answers.amount).toBe("1500000");
  });

  it("a normal rent confirm says a month", () => {
    const s = run([...rentUpToAmount, answer("amount", "25,000 per month")]);
    expect(s.pendingPrice).toMatchObject({
      sanity: null,
      message: "That’s ₹25,000 a month, correct?",
    });
  });

  it("does not warn at the thresholds", () => {
    expect(run([...upToAmount, answer("amount", "1 lakh")]).pendingPrice?.sanity).toBeNull();
    expect(run([...rentUpToAmount, answer("amount", "10 lakh")]).pendingPrice?.sanity).toBeNull();
  });

  it("an unparseable price re-asks with the message for its reason", () => {
    const s = run([...upToAmount, answer("amount", "40-45 lakh")]);
    expect(Object.hasOwn(s.answers, "amount")).toBe(false);
    expect(s.pendingPrice).toBeNull();
    expect(chatView(nagpurhomes, s)).toMatchObject({
      question: { key: "amount" },
      notice: { message: "Please give one number, like 45 lakh." },
    });
  });

  it("a new price replaces the re-ask message", () => {
    const s = run([...upToAmount, answer("amount", "lakh"), answer("amount", "45 lakh")]);
    expect(s.notice).toBeNull();
    expect(s.pendingPrice?.value).toBe(4_500_000);
  });

  it("stores a parsed area as a number string with no confirm step", () => {
    const s = run([...upToAmount.slice(0, -1), answer("areatxt", "1200.5 sqft")]);
    expect(s.answers.areatxt).toBe("1200.5");
    expect(askedKey(s)).toBe("amount");
  });

  it("an unparseable area re-asks with the message for its reason", () => {
    const s = run([...upToAmount.slice(0, -1), answer("areatxt", "1,200")]);
    expect(Object.hasOwn(s.answers, "areatxt")).toBe(false);
    expect(chatView(nagpurhomes, s)).toMatchObject({
      question: { key: "areatxt" },
      notice: { message: "Please type just the number in sq ft, without commas, like 1200 or 1200 sq ft." },
    });
  });

  it("ignores non-text answers to price and area", () => {
    const s = run(upToAmount);
    expect(run([answer("amount", 4_500_000)], s)).toBe(s);
  });

  it("confirm and change do nothing without a pending price", () => {
    const s = run(upToAmount);
    expect(run([{ type: "confirmPrice" }], s)).toBe(s);
    expect(run([{ type: "changePrice" }], s)).toBe(s);
  });

  it("editing the price goes through the confirm step", () => {
    const done = run(fullResidential);
    const s = run([{ type: "startEdit", key: "amount" }, answer("amount", "50 lakh")], done);
    expect(s.answers.amount).toBe("4500000");
    expect(chatView(nagpurhomes, s)).toMatchObject({ mode: "edit", pendingPrice: { value: 5_000_000 } });

    const after = run([{ type: "confirmPrice" }], s);
    expect(after.answers.amount).toBe("5000000");
    expect(after.editingKey).toBeNull();
    expect(chatView(nagpurhomes, after).mode).toBe("review");
  });

  it("cancelling an edit drops a pending price", () => {
    const done = run(fullResidential);
    const s = run(
      [{ type: "startEdit", key: "amount" }, answer("amount", "50 lakh"), { type: "cancelEdit" }],
      done,
    );
    expect(s.pendingPrice).toBeNull();
    expect(s.answers.amount).toBe("4500000");
  });

  it("toSubmission has the confirmed amount as digits", () => {
    const s = run(fullResidential);
    expect(toSubmission(nagpurhomes, s.answers)).toMatchObject({
      amount: "4500000",
      areatxt: "1200",
    });
  });
});

describe("full walk-through", () => {
  it("produces a payload with parsed price/area strings and the flattened mock contact", () => {
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
      areatxt: "1200",
      amount: "4500000",
      pdesc: "<p>Corner flat near the park.</p>",
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

describe("description and title suggestion", () => {
  const upToPdesc = fullResidential.slice(0, fullResidential.findIndex((a) => "key" in a && a.key === "pdesc"));

  it("does not store a typed description without the AI check", () => {
    const s = run([...upToPdesc, answer("pdesc", "<script>x</script> flat")]);
    expect(Object.hasOwn(s.answers, "pdesc")).toBe(false);
    expect(askedKey(s)).toBe("pdesc");
  });

  it("stores the accepted html and offers the suggested title at the title question", () => {
    const s = run([...upToPdesc, accepted("pdesc", "<p>2 BHK</p>", "2 BHK Flat in Dharampeth")]);
    expect(s.answers.pdesc).toBe("<p>2 BHK</p>");
    expect(chatView(nagpurhomes, s)).toMatchObject({
      mode: "ask",
      question: { key: "title" },
      suggestion: "2 BHK Flat in Dharampeth",
    });
  });

  it("offers no suggestion when there's no title", () => {
    const s = run([...upToPdesc, accepted("pdesc", "<p>2 BHK</p>")]);
    expect(chatView(nagpurhomes, s)).not.toHaveProperty("suggestion");
  });

  it("only shows the suggestion on questions suggested by that description", () => {
    const s = run([
      ...upToPdesc,
      accepted("pdesc", "<p>2 BHK</p>", "2 BHK Flat"),
      answer("title", "2 BHK Flat"),
    ]);
    expect(askedKey(s)).toBe("images");
    expect(chatView(nagpurhomes, s)).not.toHaveProperty("suggestion");
    expect(s.answers.title).toBe("2 BHK Flat");
  });

  it("editing an answered title shows the user's own title, not the suggestion again", () => {
    const s = run([
      ...upToPdesc,
      accepted("pdesc", "<p>2 BHK</p>", "2 BHK Flat"),
      answer("title", "My own title"),
      { type: "startEdit", key: "title" },
    ]);
    const view = chatView(nagpurhomes, s);
    expect(view).toMatchObject({ mode: "edit", question: { key: "title" }, current: "My own title" });
    expect(view).not.toHaveProperty("suggestion");
  });

  it("re-asks with the user's input and the message on rejection", () => {
    const s = run([
      ...upToPdesc,
      { type: "describeRejected", key: "pdesc", input: "hello", message: "Describe it." },
    ]);
    expect(Object.hasOwn(s.answers, "pdesc")).toBe(false);
    expect(chatView(nagpurhomes, s)).toMatchObject({
      question: { key: "pdesc" },
      notice: { message: "Describe it.", input: "hello" },
    });
  });

  it("an accepted description clears the re-ask", () => {
    const s = run([
      ...upToPdesc,
      { type: "describeRejected", key: "pdesc", input: "hello", message: "Describe it." },
      accepted("pdesc", "<p>2 BHK</p>"),
    ]);
    expect(s.notice).toBeNull();
  });

  it("keeps needsReview in chat state but out of the payload", () => {
    const s = run([
      ...upToPdesc,
      accepted("pdesc", "<p>Corner flat near the park.</p>", null, true),
      ...fullResidential.slice(upToPdesc.length + 1),
      { type: "submit" },
    ]);
    expect(s.needsReview).toBe(true);
    const view = chatView(nagpurhomes, s);
    expect(view.mode).toBe("submitted");
    if (view.mode === "submitted") expect(view.payload).not.toHaveProperty("needsReview");
  });

  it("a later accepted description replaces the suggestion and review flag", () => {
    const s = run([
      ...upToPdesc,
      accepted("pdesc", "<p>a</p>", "Old title", true),
      { type: "startEdit", key: "pdesc" },
      accepted("pdesc", "<p>b</p>", "New title", false),
    ]);
    expect(s.suggestion).toEqual({ from: "pdesc", value: "New title" });
    expect(s.needsReview).toBe(false);
  });

  it("ignores describeAccepted for a question that isn't longtext", () => {
    const s = run([...upToPdesc, accepted("loc", "<p>x</p>")]);
    expect(s.answers.loc).toBe("Dharampeth");
  });
});
