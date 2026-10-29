export type AreaFailure = "empty" | "not_positive" | "unrecognized";

export type AreaResult =
  | { ok: true; value: number }
  | { ok: false; reason: AreaFailure };

const AREA = /^(\d+(?:\.\d+)?)\s*(?:sq\s?ft)?$/;

/** Parses an area like "1200", "1200.5" or "1200 sq ft". No commas or other units. */
export function parseArea(input: string): AreaResult {
  const text = input.trim().toLowerCase();
  if (text === "") return { ok: false, reason: "empty" };

  const match = AREA.exec(text);
  if (!match) return { ok: false, reason: "unrecognized" };

  const value = Number(match[1]);
  if (value <= 0) return { ok: false, reason: "not_positive" };
  return { ok: true, value };
}
