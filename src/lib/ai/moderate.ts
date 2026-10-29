import "server-only";
import { callModeration, type ModerationResult } from "./client";

export type { ModerationResult };

/** OpenAI moderation for text that will be public. See callModeration for why it's uncapped. */
export function moderate(conversationId: string, text: string): Promise<ModerationResult> {
  return callModeration(conversationId, text);
}
