# Brief: issue #7, wire price and area parsers into chat

Read CLAUDE.md. Implement issue #7: use `parsePrice` and `parseArea` from `src/lib/parsers` in the chat.

- **Price:** when the user sends a price, parse it. If it parses, the bot replies "That's ₹45,00,000, correct?" with **Yes** / **Change** chips. Only Yes stores the answer. Store `amount` as a plain digit string (e.g. `"4500000"`), matching how the site strips commas. The transcript shows the formatted value.
- **Sanity check:** if listingtype is `rent` and the price is over ₹10 lakh, or listingtype is `sell` and it's under ₹1 lakh, the confirm message says so ("That's ₹25,000 for a sale. Is that right?"). This is still just Yes/Change, never a block.
- **Area:** parse it. On success, store `areatxt` as a number string. No confirm step.
- **Failures:** re-ask with a helpful message chosen by the `reason` code, with an example (e.g. range → "Please give one number, like 45 lakh"). Put the messages in one file, keyed by reason. No LLM calls.
- Tests: reducer tests for parse success → confirm → stored value, Change → re-ask, each failure reason → its message, both sanity-check cases, and `toSubmission` having `amount: "4500000"`.
- Commit messages reference #7.

Show me the plan first.

## Follow-up answers given at plan review
1. Change message: "No problem. What should the price be?" is fine.
2. Rent amounts are monthly: all rent confirm messages say "a month" (normal and rent_high).
3. Area with commas ("1,200"): re-ask for now, no parser change in this PR. Logged as a known limitation.
