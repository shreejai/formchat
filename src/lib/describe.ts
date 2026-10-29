/** What POST /api/describe returns. Shared by the route and the chat UI. */
export type DescribeResult =
  | {
      status: "accepted";
      /** The user's own text, escaped, one <p> per paragraph. */
      html: string;
      suggestedTitle: string | null;
      highlights: string[];
      costUsd: number;
      /** True when classification was skipped (token budget used up) and a person should check it. */
      needsReview: boolean;
    }
  | { status: "reask"; message: string }
  | { status: "blocked"; message: string };
