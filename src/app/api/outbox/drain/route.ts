import { createHash, timingSafeEqual } from "node:crypto";
import { error } from "@/lib/http";
import { drainOutbox } from "@/lib/outbox/drain";

/** The drain stops itself at ~45 s; this is the hard limit. */
export const maxDuration = 60;

/** Hashed first so the comparison is constant-time whatever the lengths. */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/** Called by .github/workflows/drain-outbox.yml. Delivers due outbox rows and returns counts. */
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return error(401, "Unauthorized.");
  try {
    return Response.json(await drainOutbox());
  } catch {
    console.error("drain: could not claim outbox rows");
    return error(500, "Drain failed.");
  }
}
