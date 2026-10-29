import "server-only";
import { MAX_DESCRIPTION_LENGTH, MIN_DESCRIPTION_LENGTH, type PrefilterFailure } from "./prefilter";

/** Bot replies for the description, keyed by why it wasn't accepted. */

export type ReaskReason =
  | PrefilterFailure
  | "off_topic"
  | "question_about_process"
  | "could_not_understand"
  | "unavailable";

export type BlockReason = "abuse_or_injection" | "flagged";

export const describeReask: Record<ReaskReason, string> = {
  empty: "Please describe the property, like: 2 BHK flat, fully furnished, with parking.",
  too_short: `Please add a bit more, at least ${MIN_DESCRIPTION_LENGTH} characters. For example: rooms, furnishing, floor, parking, nearby places.`,
  too_long: `That’s a bit long. Please keep it under ${MAX_DESCRIPTION_LENGTH} characters.`,
  no_letters: "Please describe the property in words, like: 2 BHK flat near Dharampeth, semi-furnished.",
  contact_details:
    "Please remove phone numbers and email addresses. Listings can’t show them, and we’ll ask for your contact details in the last step.",
  off_topic:
    "Let’s stick to the property. Describe it in a few lines: rooms, furnishing, floor, parking, nearby places.",
  question_about_process:
    "Good question! For now, just describe the property in a few lines: rooms, furnishing, floor, parking, nearby places. Hinglish is fine.",
  could_not_understand:
    "Sorry, I couldn’t follow that. Please describe the property in a few lines: rooms, furnishing, floor, parking, nearby places.",
  unavailable: "Sorry, I couldn’t check that just now. Please send it again in a moment.",
};

export const describeBlocked: Record<BlockReason, string> = {
  abuse_or_injection:
    "I can’t use that as a listing description. Please describe the property itself: rooms, furnishing, floor, parking, nearby places.",
  flagged:
    "That description can’t be published as written. Please describe the property itself, without offensive content.",
};
