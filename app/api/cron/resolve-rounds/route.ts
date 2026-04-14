import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/cron-auth";
import { finalizeRoundResolution } from "@/lib/cron/finalize-round-resolution";
import { fetchMarketPrices } from "@/lib/cron/market-prices";
import {
  evaluateOutcomeFromCriteria,
  parseResolutionCriteriaFromDescription,
} from "@/lib/cron/resolution";
import { db, getRoundById, updateRoundStatus } from "@/lib/db/client";
import { sampleOutcome } from "@/lib/engine/signal-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function promoteOpenRoundsToLocked(nowIso: string): Promise<number> {
  const { data, error } = await db
    .from("rounds")
    .select("id")
    .eq("status", "open")
    .lte("locks_at", nowIso);

  if (error) throw new Error(error.message);

  let n = 0;
  for (const row of data ?? []) {
    await updateRoundStatus((row as { id: string }).id, "locked");
    n++;
  }
  return n;
}

async function handle(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const nowIso = new Date().toISOString();
  const lockedCount = await promoteOpenRoundsToLocked(nowIso);

  const { data: toResolve, error } = await db
    .from("rounds")
    .select("id, description")
    .eq("status", "locked")
    .lte("locks_at", nowIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let prices;
  try {
    prices = await fetchMarketPrices();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Failed to fetch market prices: ${message}` },
      { status: 500 }
    );
  }

  const resolvedIds: string[] = [];
  const errors: { round_id: string; message: string }[] = [];

  for (const row of toResolve ?? []) {
    const roundId = (row as { id: string; description: string }).id;
    const description = (row as { description: string }).description;

    try {
      const criteria = parseResolutionCriteriaFromDescription(description);
      const round = await getRoundById(roundId);
      if (!round) continue;

      let outcome: number;
      if (criteria) {
        outcome = evaluateOutcomeFromCriteria(criteria, prices);
      } else {
        outcome = sampleOutcome(round.theta);
      }

      await finalizeRoundResolution(roundId, outcome);
      resolvedIds.push(roundId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ round_id: roundId, message });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    promoted_open_to_locked: lockedCount,
    resolved_round_ids: resolvedIds,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
