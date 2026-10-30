import "server-only";
import { hasContactDetails } from "@/lib/pii/detect";

export const MIN_DESCRIPTION_LENGTH = 20;
export const MAX_DESCRIPTION_LENGTH = 2000;

export type PrefilterFailure = "empty" | "too_short" | "too_long" | "no_letters" | "contact_details";

export type PrefilterResult =
  | { ok: true; text: string }
  | { ok: false; reason: PrefilterFailure }
  | { ok: false; block: "abuse_or_injection" };

// Shared with PII redaction, so a number the prefilter rejects is one redact() masks.
export { hasContactDetails } from "@/lib/pii/detect";

/**
 * Prompt-injection markers, kept tight so ordinary descriptions don't trip them. A cheap first
 * layer only: the classifier is still told to label anything addressed to it as injection.
 * Phrases must sit in one sentence so far-apart words don't join up.
 */
const INJECTION_MARKERS: RegExp[] = [
  // Our prompt delimiters (<<<DESCRIPTION, DESCRIPTION>>>) or anything faking them.
  /<<<|>>>/,
  /\bignore\b[^.!?\n]{0,40}\binstructions?\b/i,
  // Line start only, so "Water system: 24 hr supply" is fine.
  /^\s*system\s*:/im,
  /\bdeveloper\s+mode\b/i,
  /\badmin\s+note\b/i,
  // Whole word, so "labelled as NMRDA plot" is fine.
  /\blabel\b[^.!?\n]{0,30}\bas\b/i,
  // Notes to whoever checks the listing: "Note to the reviewer: …", "mark it as complete".
  // Buyers aren't in the list, so "Note for buyers: no brokers" is fine.
  /\bnote\s+(to|for)\s+(the\s+)?(reviewers?|moderators?|admins?|team|system|ai)\b/i,
  /\b(mark|approve)\s+(this|it)\s+as\b/i,
  // Role changes. "you are now" and "act as" are narrowed so "you are now able to view the
  // flat" and "the study can act as a guest room" are fine.
  /\bforget\s+(that\s+)?you\s+are\b/i,
  /\byou\s+are\s+now\s+(a|an|in|the|my|no\s+longer)\b/i,
  /(^|[.!?:]\s*)(please\s+|now\s+)?act\s+as\b/im,
  /\bpretend\s+(to\s+be|(that\s+)?you\s+are)\b/i,
  // Hinglish: "instructions bhool jao", "instructions ignore karo".
  /\binstructions?\b[^.!?\n]{0,20}\b(bh(oo|u)l|ignore)/i,
  // Hindi: "निर्देश … भूल" (instructions … forget).
  /निर्देश[^.!?।\n]{0,40}भूल/u,
];

export function hasInjectionMarkers(text: string): boolean {
  return INJECTION_MARKERS.some((pattern) => pattern.test(text));
}

/** Free checks before any model call. Length is counted in characters, not UTF-16 units. */
export function prefilter(input: string): PrefilterResult {
  const text = input.trim();
  const length = [...text].length;
  if (length === 0) return { ok: false, reason: "empty" };
  if (length < MIN_DESCRIPTION_LENGTH) return { ok: false, reason: "too_short" };
  if (length > MAX_DESCRIPTION_LENGTH) return { ok: false, reason: "too_long" };
  if (!/\p{L}/u.test(text)) return { ok: false, reason: "no_letters" };
  if (hasInjectionMarkers(text)) return { ok: false, block: "abuse_or_injection" };
  if (hasContactDetails(text)) return { ok: false, reason: "contact_details" };
  return { ok: true, text };
}
