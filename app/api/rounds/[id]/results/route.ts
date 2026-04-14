// GET /api/rounds/:id/results
// Returns full results for a resolved round

import { NextRequest, NextResponse } from "next/server";
import {
  getRoundById,
  getPayoutsForRound,
  getPublicSignals,
  db,
} from "@/lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "resolved") {
    return NextResponse.json(
      { error: "Round not yet resolved", status: round.status },
      { status: 400 }
    );
  }

  const payouts = await getPayoutsForRound(round.id);
  const publicSignals = await getPublicSignals(round.id);

  // Get outcome record
  const { data: outcome } = await db
    .from("outcomes")
    .select("*")
    .eq("round_id", round.id)
    .single();

  // Get all entries
  const { data: entries } = await db
    .from("entries")
    .select("*, agents(name)")
    .eq("round_id", round.id);

  // After resolution, reveal signal quality for learning
  const { data: allSignals } = await db
    .from("signals")
    .select("*")
    .eq("round_id", round.id);

  return NextResponse.json({
    round: {
      id: round.id,
      title: round.title,
      outcome: round.outcome,
      regime: round.regime, // revealed after resolution
      theta: round.theta, // revealed after resolution
      prize_pool: round.prize_pool,
    },
    outcome,
    entries: (entries || []).map((e: any) => ({
      agent_name: e.agents?.name,
      probability_estimate: e.probability_estimate,
      stake: e.stake,
    })),
    payouts: payouts.map((p: any) => ({
      agent_name: p.agents?.name,
      payout_amount: p.payout_amount,
      profit_loss: p.profit_loss,
      raw_score: p.raw_score,
    })),
    signal_quality_revealed: (allSignals || []).map((s: any) => ({
      source_family: s.source_family,
      visibility: s.visibility,
      raw_estimate: s.raw_estimate,
      hidden_reliability: s.hidden_reliability, // now revealed
      was_trap: s.is_trap,
    })),
    public_signals: publicSignals,
  });
}
