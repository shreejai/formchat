import { describe, expect, it } from "vitest";
import type { Question } from "@/forms/types";
import { nagpurhomes } from "@/forms/nagpurhomes";
import { nagpurLocalities } from "@/forms/nagpurhomes-localities";
import { validateContact } from "./contact";
import { formatAnswer } from "./format";
import { filterLocalities } from "./localities";
import { MAX_TEXT } from "@/lib/submit/shared";
import { addImageFiles, MAX_IMAGE_BYTES, MAX_IMAGES, shortFileName, type FileLike } from "./upload";

const q = (key: string): Question => {
  const found = nagpurhomes.sections.flatMap((s) => s.questions).find((x) => x.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe("formatAnswer", () => {
  it("shows a stored description as plain text, never as markup", () => {
    expect(formatAnswer(q("pdesc"), "<p>Nice &lt;b&gt;flat&lt;/b&gt;<br>near park</p><p>Ready</p>")).toBe(
      "Nice <b>flat</b>\nnear park\n\nReady",
    );
  });

  it("shows option labels for button answers", () => {
    expect(formatAnswer(q("ptype"), "plot")).toBe("Plot/Land");
    expect(formatAnswer(q("areatype"), "unknown")).toBe("Don't know");
  });
  it("shows Skipped for null", () => {
    expect(formatAnswer(q("beds"), null)).toBe("Skipped");
  });
  it("shows free text as is", () => {
    expect(formatAnswer(q("title"), "3BHK in Dharampeth")).toBe("3BHK in Dharampeth");
  });
  it("formats a stored price in rupees and an area in sq ft", () => {
    expect(formatAnswer(q("amount"), "4500000")).toBe("₹45,00,000");
    expect(formatAnswer(q("areatxt"), "1200.5")).toBe("1200.5 sq ft");
  });
  it("counts images", () => {
    expect(formatAnswer(q("images"), ["a.jpg"])).toBe("1 image");
    expect(formatAnswer(q("images"), ["a.jpg", "b.png"])).toBe("2 images");
  });
  it("summarizes contact", () => {
    expect(
      formatAnswer(q("contact"), { name: "A", email: "a@example.com", phone: "123" }),
    ).toBe("A · 123 · a@example.com");
  });
});

describe("filterLocalities", () => {
  const list = ["Dharampeth", "Ramdaspeth", "Sadar", "Manish Nagar", "Laxmi Nagar"];

  it("returns nothing for an empty query", () => {
    expect(filterLocalities("  ", list)).toEqual([]);
  });
  it("matches case-insensitively, prefix matches first", () => {
    expect(filterLocalities("PETH", list)).toEqual(["Dharampeth", "Ramdaspeth"]);
    expect(filterLocalities("nagar", list)).toEqual(["Manish Nagar", "Laxmi Nagar"]);
    expect(filterLocalities("ra", list)).toEqual(["Ramdaspeth", "Dharampeth"]);
  });
  it("hides suggestions once the query equals one", () => {
    expect(filterLocalities("sadar", list)).toEqual([]);
  });
  it("caps the number of results", () => {
    expect(filterLocalities("a", nagpurLocalities, 3)).toHaveLength(3);
  });
});

describe("addImageFiles", () => {
  const img = (name: string, size = 1000): FileLike => ({ name, type: "image/jpeg", size });

  it("accepts images up to exactly 10 MB", () => {
    const r = addImageFiles([], [img("a.jpg", MAX_IMAGE_BYTES)]);
    expect(r.files).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });
  it("rejects files over 10 MB", () => {
    const r = addImageFiles([], [img("big.jpg", MAX_IMAGE_BYTES + 1)]);
    expect(r.files).toEqual([]);
    expect(r.errors).toEqual(["big.jpg is larger than 10 MB."]);
  });
  it("rejects non-images, including files with no type", () => {
    const r = addImageFiles(
      [],
      [
        { name: "doc.pdf", type: "application/pdf", size: 10 },
        { name: "mystery", type: "", size: 10 },
        img("ok.jpg"),
      ],
    );
    expect(r.files.map((f) => f.name)).toEqual(["ok.jpg"]);
    expect(r.errors).toEqual(["doc.pdf is not an image.", "mystery is not an image."]);
  });
  it("caps at 10 images with a clear message", () => {
    const current = Array.from({ length: 8 }, (_, i) => img(`${i}.jpg`));
    const r = addImageFiles(current, [img("x.jpg"), img("y.jpg"), img("z.jpg")]);
    expect(r.files).toHaveLength(MAX_IMAGES);
    expect(r.files.at(-1)?.name).toBe("y.jpg");
    expect(r.errors).toEqual(["You can add up to 10 images. 1 was not added."]);
  });
  it("adds nothing when already full", () => {
    const current = Array.from({ length: 10 }, (_, i) => img(`${i}.jpg`));
    const r = addImageFiles(current, [img("x.jpg"), img("y.jpg")]);
    expect(r.files).toHaveLength(10);
    expect(r.errors).toEqual(["You can add up to 10 images. 2 were not added."]);
  });
  it("does not mutate the current list", () => {
    const current = [img("a.jpg")];
    addImageFiles(current, [img("b.jpg")]);
    expect(current).toHaveLength(1);
  });
});

describe("shortFileName", () => {
  it("leaves names within the limit alone", () => {
    expect(shortFileName("IMG_0001.jpg")).toBe("IMG_0001.jpg");
    expect(shortFileName("a".repeat(MAX_TEXT))).toBe("a".repeat(MAX_TEXT));
  });

  it("shortens a long name to the server limit, keeping the extension", () => {
    const name = shortFileName(`${"WhatsApp Image ".repeat(20)}.jpeg`);
    expect(name).toHaveLength(MAX_TEXT);
    expect(name.endsWith(".jpeg")).toBe(true);
  });

  it("never splits an emoji", () => {
    const name = shortFileName(`a${"🏠".repeat(150)}.png`);
    expect(name.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(name).toMatch(/^a(🏠)+\.png$/u);
  });
});

describe("validateContact", () => {
  it.each(["name", "email", "phone"] as const)("rejects a %s over the server limit", (key) => {
    const contact = { name: "A", email: "a@example.com", phone: "98765 43210" };
    const long = key === "email" ? `${"a".repeat(MAX_TEXT)}@example.com` : `9${"8".repeat(MAX_TEXT)}`;
    expect(validateContact({ ...contact, [key]: long })).toEqual({
      [key]: `Keep this to ${MAX_TEXT} characters or fewer.`,
    });
  });


  it("accepts the mock user shape", () => {
    expect(validateContact({ name: "A", email: "a@example.com", phone: "98765 43210" })).toEqual(
      {},
    );
  });
  it("flags empty name, bad email and short phone", () => {
    expect(validateContact({ name: " ", email: "nope", phone: "123" })).toEqual({
      name: expect.any(String),
      email: expect.any(String),
      phone: expect.any(String),
    });
  });
});
