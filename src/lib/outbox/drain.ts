import "server-only";
import { claimDue, type OutboxRow } from "@/lib/db/outbox";
import { deliver, DELIVERY_TIMEOUT_MS, type DeliveryResult } from "./deliver";

export const DRAIN_BATCH = 20;
/** Stay well inside the route's 60 s maxDuration. */
export const DRAIN_BUDGET_MS = 45_000;

export type DrainCounts = {
  claimed: number;
  delivered: number;
  retrying: number;
  failed: number;
  /** Claimed but not attempted. They stay leased and are picked up once the lease runs out. */
  skipped: number;
};

export type DrainDeps = {
  claim?: (limit: number) => Promise<OutboxRow[]>;
  deliverRow?: (row: OutboxRow) => Promise<DeliveryResult>;
  now?: () => number;
};

/** A timeout or network error means the service is down or cold, so the rest would fail too. */
function serviceUnreachable(result: DeliveryResult): boolean {
  return ["timeout", "network", "unconfigured"].includes(result.outcome.kind);
}

/**
 * Delivers due pending rows one at a time. Stops early at the first timeout or network error,
 * and before any attempt that could run past the time budget. Rows it doesn't attempt keep
 * their attempt count.
 */
export async function drainOutbox(deps: DrainDeps = {}): Promise<DrainCounts> {
  const { claim = claimDue, deliverRow = (row) => deliver(row), now = Date.now } = deps;
  const start = now();
  const rows = await claim(DRAIN_BATCH);
  const counts: DrainCounts = { claimed: rows.length, delivered: 0, retrying: 0, failed: 0, skipped: 0 };

  for (const [index, row] of rows.entries()) {
    if (now() - start + DELIVERY_TIMEOUT_MS > DRAIN_BUDGET_MS) {
      counts.skipped = rows.length - index;
      break;
    }
    const result = await deliverRow(row);
    if (result.update?.status === "delivered") counts.delivered += 1;
    else if (result.update?.status === "failed") counts.failed += 1;
    else if (result.update) counts.retrying += 1;
    if (serviceUnreachable(result)) {
      counts.skipped = rows.length - index - (result.update ? 1 : 0);
      break;
    }
  }
  return counts;
}
