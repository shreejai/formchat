import { describe, expect, it } from "vitest";
import type { ContactValue } from "@/forms/types";
import { redact, REDACTED_CONTACT } from "./redact";

const rahul: ContactValue = {
  name: "Rahul Deshmukh",
  email: "Rahul.D@Example.com",
  phone: "+91 98765 43210",
};

describe("redact", () => {
  it("masks the known name, email and phone", () => {
    expect(redact("I am Rahul Deshmukh, mail rahul.d@example.com or call 9876543210", rahul)).toBe(
      "I am [NAME], mail [EMAIL] or call [PHONE]",
    );
  });

  it("masks name parts on their own, case-insensitively", () => {
    expect(redact("RAHUL here, ask for deshmukh ji", rahul)).toBe("[NAME] here, ask for [NAME] ji");
  });

  it("matches the name as a whole word only", () => {
    expect(redact("Rahulnagar is close by", rahul)).toBe("Rahulnagar is close by");
  });

  it("over-redacts a name part that is also a locality word", () => {
    const ram = { name: "Ram Patil", email: "ram@example.com", phone: "9822012345" };
    expect(redact("Flat in Ram Nagar", ram)).toBe("Flat in [NAME] Nagar");
  });

  it("ignores name parts shorter than three letters", () => {
    const short = { name: "Al Khan", email: "a@example.com", phone: "9822012345" };
    expect(redact("Al Khan says hi. Al is short.", short)).toBe("[NAME] says hi. Al is short.");
  });

  it.each([
    "98765 43210",
    "98765-43210",
    "+91-98765-43210",
    "+91 98765 43210",
    "098765-43210",
    "(+91) 98765.43210",
    "919876543210",
  ])("masks the known phone written as %s", (written) => {
    expect(redact(`call ${written} today`, rahul)).toBe("call [PHONE] today");
  });

  it("masks a known phone that the Indian pattern wouldn't catch", () => {
    const mock = { name: "Test User (mock)", email: "test.user@example.com", phone: "0000000000" };
    expect(redact("reach me on 00000 00000", mock)).toBe("reach me on [PHONE]");
  });

  it("masks other emails and Indian phones by pattern without a known contact", () => {
    expect(redact("write to someone@else.in or ring 0712 2345678")).toBe(
      "write to [EMAIL] or ring [PHONE]",
    );
  });

  it.each([
    "Price 45,00,000 negotiable",
    "Rent 75000-80000 per month",
    "Area 1200 sq ft, 3 BHK",
    "Plot of 2400 sqft for 1.2 crore",
    "4500000",
  ])("leaves prices and areas alone: %s", (text) => {
    expect(redact(text, rahul)).toBe(text);
  });

  it("returns text unchanged when there is nothing to mask", () => {
    expect(redact("2 BHK near Futala lake")).toBe("2 BHK near Futala lake");
  });

  it("has a fixed form for the contact turn", () => {
    expect(REDACTED_CONTACT).toBe("[NAME] · [PHONE] · [EMAIL]");
  });
});
