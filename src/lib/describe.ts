type Accepted = {
  status: "accepted";
  /** The user's own text, escaped, one <p> per paragraph. */
  html: string;
  suggestedTitle: string | null;
  highlights: string[];
  costUsd: number;
  /** True when classification was skipped (token budget used up) and a person should check it. */
  needsReview: boolean;
};

type NotAccepted = { status: "reask"; message: string } | { status: "blocked"; message: string };

/** What the AI pipeline decides. */
export type DescribeCheck = Accepted | NotAccepted;

/** What POST /api/describe returns. Shared by the route and the chat UI. */
export type DescribeResult =
  | (Accepted & {
      /** Signs conversationId, html, needsReview and costUsd; /api/submit checks it. */
      pdescToken: string;
    })
  | NotAccepted;
