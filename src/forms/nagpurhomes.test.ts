import { describe, expect, it } from "vitest";
import type { AnswerValue, Answers } from "./types";
import { nagpurhomes } from "./nagpurhomes";
import { getNextStep } from "@/lib/flow";

const sampleAnswers: Record<string, AnswerValue> = {
  usertype: "owner",
  listingtype: "sell",
  loc: "Dharampeth",
  beds: "3",
  bath: "2",
  areatype: "area",
  areatxt: 1200,
  amount: "50 lakh",
  pdesc: "<p>Nice</p>",
  title: "Listing",
  images: null,
  contact: { name: "A", email: "a@example.com", phone: "9000000000" },
  acceptTerms: "accept",
};

/** Answers each question as it is asked, and records the order of keys. */
function walk(ptype: string): string[] {
  const asked: string[] = [];
  let answers: Answers = {};
  for (;;) {
    const step = getNextStep(nagpurhomes, answers);
    if (step.status === "complete") return asked;
    const { key } = step.question;
    asked.push(key);
    answers = { ...step.answers, [key]: key === "ptype" ? ptype : sampleAnswers[key] };
  }
}

describe("nagpurhomes schema", () => {
  it("has the four sections in order", () => {
    expect(nagpurhomes.sections.map((s) => s.title)).toEqual([
      "Property Details",
      "Location & Price",
      "Description & Images",
      "Contact Info",
    ]);
  });

  it("asks title right after pdesc", () => {
    const keys = nagpurhomes.sections[2].questions.map((q) => q.key);
    expect(keys).toEqual(["pdesc", "title", "images"]);
  });

  it("walks a residential listing", () => {
    expect(walk("residential")).toEqual([
      "usertype", "listingtype", "ptype",
      "loc", "beds", "bath", "areatype", "areatxt", "amount",
      "pdesc", "title", "images",
      "contact", "acceptTerms",
    ]);
  });

  it("walks a commercial listing (bath, no beds)", () => {
    const asked = walk("commercial");
    expect(asked).toContain("bath");
    expect(asked).not.toContain("beds");
  });

  it("walks a plot listing (no beds, no bath)", () => {
    const asked = walk("plot");
    expect(asked).not.toContain("beds");
    expect(asked).not.toContain("bath");
    expect(asked).toHaveLength(12);
  });

  it("reports section 2 of 4 once section 1 is done", () => {
    const step = getNextStep(nagpurhomes, {
      usertype: "owner",
      listingtype: "rent",
      ptype: "plot",
    });
    expect(step.status === "question" && step.section).toMatchObject({
      id: "location-price",
      number: 2,
      total: 4,
    });
  });
});
