import { describe, expect, it } from "vitest";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { toSubmission } from "./payload";

const contact = { name: "Asha", email: "asha@example.com", phone: "9000000000" };

const complete = {
  usertype: "owner",
  listingtype: "sell",
  ptype: "residential",
  loc: "Dharampeth",
  beds: "3",
  bath: "2",
  areatype: "builtup",
  areatxt: 1200,
  amount: "50 lakh",
  pdesc: "<p>Sunny flat</p>",
  title: "3BHK in Dharampeth",
  images: ["a.jpg"],
  contact,
  acceptTerms: "accept",
};

describe("toSubmission", () => {
  it("flattens contact into name, email and phone and excludes acceptTerms", () => {
    const out = toSubmission(nagpurhomes, complete);
    expect(out).toMatchObject(contact);
    expect(out).not.toHaveProperty("contact");
    expect(out).not.toHaveProperty("acceptTerms");
    expect(out.areatxt).toBe(1200);
    expect(out.images).toEqual(["a.jpg"]);
  });

  it("excludes stale answers", () => {
    const out = toSubmission(nagpurhomes, { ...complete, ptype: "plot" });
    expect(out).not.toHaveProperty("beds");
    expect(out).not.toHaveProperty("bath");
  });

  it("skipping areatype submits areatype 'unknown' and no areatxt", () => {
    const out = toSubmission(nagpurhomes, { ...complete, areatype: null });
    expect(out.areatype).toBe("unknown");
    expect(out).not.toHaveProperty("areatxt");
  });

  it("omits skipped optional questions that have no default", () => {
    const out = toSubmission(nagpurhomes, {
      ...complete,
      beds: null,
      bath: null,
      images: null,
    });
    expect(out).not.toHaveProperty("beds");
    expect(out).not.toHaveProperty("bath");
    expect(out).not.toHaveProperty("images");
  });
});
