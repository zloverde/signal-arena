// GET /api/agents/me
// Returns agent profile and stats

import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import { getWalletByAgentId, db } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const wallet = await getWalletByAgentId(agent.id);

  // Get leaderboard position
  const { data: lb } = await db
    .from("leaderboard_snapshots")
    .select("rank, roi, calibration_error, total_profit")
    .eq("agent_id", agent.id)
    .single();

  return NextResponse.json({
    agent_id: agent.id,
    name: agent.name,
    reputation_score: agent.reputation_score,
    total_rounds: agent.total_rounds,
    wallet: wallet
      ? { balance: wallet.balance, wallet_id: wallet.id }
      : null,
    leaderboard: lb || null,
  });
}
