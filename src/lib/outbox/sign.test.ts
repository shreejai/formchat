import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { signWebhook } from "./sign";

/**
 * The contract's test vector (docs/contracts/lead-webhook-v1.md, "Test vector"). The body is
 * the JSON block under "## Body", taken from the file itself so the two can't drift apart.
 */
const contract = readFileSync(
  new URL("../../../docs/contracts/lead-webhook-v1.md", import.meta.url),
  "utf8",
);
const body = /## Body\s+```json\n([\s\S]*?)\n```/.exec(contract)?.[1] ?? "";

describe("signWebhook", () => {
  it("uses the contract example body exactly: 752 bytes, LF, no trailing newline", () => {
    expect(Buffer.byteLength(body, "utf8")).toBe(752);
    expect(body.startsWith("{")).toBe(true);
    expect(body.endsWith("}")).toBe(true);
    expect(body).not.toContain("\r");
  });

  it("matches the contract test vector", () => {
    expect(signWebhook("test-secret", 1761725700, body)).toBe(
      "sha256=70a0d6ea295e9a210294cd51bbb78a582dc10b28e1f60d9a0eb80b5468bf6be0",
    );
  });

  it("changes with the timestamp, the body or the secret", () => {
    const base = signWebhook("test-secret", 1761725700, body);
    expect(signWebhook("test-secret", 1761725701, body)).not.toBe(base);
    expect(signWebhook("test-secret", 1761725700, `${body}\n`)).not.toBe(base);
    expect(signWebhook("other-secret", 1761725700, body)).not.toBe(base);
  });
});
