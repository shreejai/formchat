This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CI

GitHub Actions runs two workflows:

- **`ci.yml`**, on every pull request and every push to `main`:
  - `build`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `next build`. Node version comes from `.nvmrc`.
  - `secrets`: [gitleaks](https://github.com/gitleaks/gitleaks) scans the full git history. Any finding fails the build.
- **`evals.yml`** runs `npm run eval` against the real OpenAI API, so it costs money and never runs on its own. Start it from the Actions tab ("Run workflow"), or add the `run-evals` label to a PR. With the label on, it re-runs on every push. It needs the `OPENAI_API_KEY` repo secret.

Environment variables the app reads are listed in `.env.example`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
