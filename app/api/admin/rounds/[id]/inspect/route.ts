// GET /api/admin/rounds/[id]/inspect
// Full round inspection including hidden fields

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/auth";
import { getRoundById, getEntriesForRound, db } from "../../../../../lib/db/client";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminError = requireAdmin(req);
  if (adminError) return adminError;

  const round = await getRoundById(params.id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const entries = await getEntriesForRound(params.id);

  // Get all signals with hidden fields exposed
  const { data: signals } = await db
    .from("signals")
    .select("*")
    .eq("round_id", params.id)
    .order("visibility");

  // Get all assignments
  const { data: assignments } = await db
    .from("private_signal_assignments")
    .select("agent_id, signal_id, agents(name)")
    .eq("round_id", params.id);

  // Get payouts if resolved
  const { data: payouts } = await db
    .from("payouts")
    .select("*, agents(name)")
    .eq("round_id", params.id);

  // Compute entry stats
  const avgEstimate =
    entries.length > 0
      ? entries.reduce((a, e) => a + e.probability_estimate, 0) / entries.length
      : null;

  const totalStaked = entries.reduce((a, e) => a + e.stake, 0);

  return NextResponse.json({
    round, // includes regime and theta
    entries: entries.map((e) => ({
      ...e,
      distance_from_theta: Math.abs(e.probability_estimate - round.theta),
    })),
    entry_stats: {
      count: entries.length,
      avg_estimate: avgEstimate,
      theta: round.theta,
      total_staked: totalStaked,
      prize_pool: round.prize_pool,
    },
    signals,
    private_assignments: assignments,
    payouts: payouts || [],
  });
}
