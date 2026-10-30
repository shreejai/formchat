/*
 * Shared by the chat (client) and /api/submit (server), so the limits on the two sides can't
 * drift. No server-only imports here.
 */

/** Longest single-line answer: title, location, each contact field, each image file name. */
export const MAX_TEXT = 200;

/**
 * An input the chat didn't store, sent with the submit for analysis only. `outcome` is e.g.
 * "reask:range" (a parser re-ask) or "blocked" (from /api/describe).
 */
export type Attempt = { key: string; text: string; outcome: string };

/** The chat keeps only the latest this many, and the server stores at most this many. */
export const MAX_ATTEMPTS_STORED = 20;
/** Each attempt's text is cut to this length on both sides, so a long paste can't fail the submit. */
export const MAX_ATTEMPT_TEXT = 2000;

/** At most `max` UTF-16 units (what `.length` and `maxLength` count), never splitting a pair. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}
