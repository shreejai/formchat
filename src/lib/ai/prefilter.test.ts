import { describe, expect, it } from "vitest";
import { hasContactDetails, prefilter, type PrefilterFailure } from "./prefilter";

const ok = "2 BHK flat in Dharampeth, fully furnished.";

describe("prefilter", () => {
  it("accepts and trims a normal description", () => {
    expect(prefilter(`  ${ok}\n`)).toEqual({ ok: true, text: ok });
  });

  it("accepts Hinglish and Devanagari", () => {
    expect(prefilter("2bhk flat hai Dharampeth me, parking bhi hai").ok).toBe(true);
    expect(prefilter("धरमपेठ में 2 बीएचके फ्लैट, पार्किंग के साथ").ok).toBe(true);
  });

  it("accepts exactly 20 and 2000 characters", () => {
    expect(prefilter("a".repeat(20)).ok).toBe(true);
    expect(prefilter("a".repeat(2000)).ok).toBe(true);
  });

  const rejected: [input: string, reason: PrefilterFailure][] = [
    ["", "empty"],
    ["   \n ", "empty"],
    ["a".repeat(19), "too_short"],
    ["  short text  ", "too_short"],
    ["a".repeat(2001), "too_long"],
    ["1234 5678 !!!! ---- 9999", "no_letters"],
  ];

  it.each(rejected)("rejects %j as %s", (input, reason) => {
    expect(prefilter(input)).toEqual({ ok: false, reason });
  });

  it("counts characters, not UTF-16 units", () => {
    // 19 emoji are 38 UTF-16 units but 19 characters.
    expect(prefilter("🏠".repeat(19))).toEqual({ ok: false, reason: "too_short" });
  });

  it("rejects contact details", () => {
    expect(prefilter(`${ok} Call 9876543210`)).toEqual({ ok: false, reason: "contact_details" });
  });
});

describe("hasContactDetails", () => {
  const contacts = [
    "call 9876543210",
    "call +91 98765 43210",
    "call +91-98765-43210",
    "whatsapp 098765 43210",
    "phone (0712) 2345678",
    "call 98.765.432.10",
    "mail owner@example.com",
    "mail Owner.Name+flat@mail.co.in",
  ];

  it.each(contacts)("flags %j", (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });

  const clean = [
    "asking 45,00,000",
    "price 1,20,00,000 negotiable",
    "1.2 crore, 1200 sq ft",
    "4500000 rupees",
    "built 2019, 3rd floor, 2 parking",
    "plot 30x40, 1200 sqft, 45 lakh",
    "near sector 12, pin 440010",
    "@ Dharampeth, rent 25000",
  ];

  it.each(clean)("does not flag %j", (text) => {
    expect(hasContactDetails(text)).toBe(false);
  });
});
