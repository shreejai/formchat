import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, requiredEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requiredEnv", () => {
  it("returns the value when set", () => {
    vi.stubEnv("FORMCHAT_TEST_VAR", "x");
    expect(requiredEnv("FORMCHAT_TEST_VAR")).toBe("x");
  });

  it.each(["", undefined])("throws a ConfigError naming the variable when %j", (value) => {
    vi.stubEnv("FORMCHAT_TEST_VAR", value);
    expect(() => requiredEnv("FORMCHAT_TEST_VAR")).toThrow(ConfigError);
    expect(() => requiredEnv("FORMCHAT_TEST_VAR")).toThrow("Missing env var FORMCHAT_TEST_VAR");
  });
});
