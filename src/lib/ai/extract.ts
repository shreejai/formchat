import "server-only";
import { z } from "zod";
import { callStructured, type CallResult } from "./client";
import { DATA_RULE, wrapDescription } from "./prompt";

export const MAX_TITLE_LENGTH = 70;
export const MAX_HIGHLIGHTS = 6;
const MAX_OUTPUT_TOKENS = 600;

export const ExtractionSchema = z.object({
  suggestedTitle: z.string().max(MAX_TITLE_LENGTH),
  highlights: z.array(z.string().max(80)).max(MAX_HIGHLIGHTS),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export const EXTRACT_SYSTEM = `You write a listing title and short highlights for a property ad on nagpurhomes.com (Nagpur, India).

${DATA_RULE}

Rules:
- Use only facts stated in the description. Never add, guess or round anything: no amenities, sizes, prices, floors, localities or features that are not in the text.
- Write in plain English even if the description is in Hinglish or Hindi, keeping place names as written.
- suggestedTitle: at most ${MAX_TITLE_LENGTH} characters, e.g. "Fully Furnished 2 BHK Flat in Dharampeth". No prices, phone numbers, emojis or ALL CAPS.
- highlights: up to ${MAX_HIGHLIGHTS} short phrases, one fact each, e.g. "Covered parking". Fewer is fine.
- If the description has too little to work with, return an empty title and no highlights.`;

/** Numbers in a text, with thousands separators removed: "45,00,000" → "4500000". */
function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "")));
}

/** True if every number in `output` also appears in `input`. Catches invented sizes and prices. */
export function numbersGrounded(output: string, input: string): boolean {
  const known = numbersIn(input);
  return [...numbersIn(output)].every((n) => known.has(n));
}

export type ExtractOutcome = {
  result: CallResult<Extraction>;
  costUsd: number;
};

/**
 * Title and highlights for an accepted description. A title or highlight with a number that
 * isn't in the input is dropped, as is an empty title.
 */
export async function extract(conversationId: string, text: string): Promise<ExtractOutcome> {
  const result = await callStructured({
    conversationId,
    purpose: "extract",
    tier: "small",
    schema: ExtractionSchema,
    system: EXTRACT_SYSTEM,
    user: wrapDescription(text),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  const costUsd = result.usage?.costUsd ?? 0;
  if (!result.ok) return { result, costUsd };

  const title = result.data.suggestedTitle.trim();
  const data: Extraction = {
    suggestedTitle: title && numbersGrounded(title, text) ? title : "",
    highlights: result.data.highlights
      .map((h) => h.trim())
      .filter((h) => h !== "" && numbersGrounded(h, text)),
  };
  return { result: { ...result, data }, costUsd };
}
