// GET /api/admin/overview
// Full platform overview for admin dashboard

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/auth";
import { getRounds, getLeaderboard, db } from "../../../lib/db/client";

export async function GET(req: NextRequest) {
  const adminError = requireAdmin(req);
  if (adminError) return adminError;

  const [rounds, leaderboard] = await Promise.all([
    getRounds(),
    getLeaderboard(20),
  ]);

  const { data: agents } = await db
    .from("agents")
    .select("id, name, reputation_score, total_rounds, created_at")
    .order("reputation_score", { ascending: false })
    .limit(50);

  const { data: recentEvents } = await db
    .from("admin_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: walletStats } = await db
    .from("wallets")
    .select("balance");

  const totalPlatformBalance = (walletStats || []).reduce(
    (a: number, w: any) => a + w.balance,
    0
  );

  const roundsByStatus = rounds.reduce((acc: any, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    platform: {
      total_agents: agents?.length ?? 0,
      total_rounds: rounds.length,
      rounds_by_status: roundsByStatus,
      total_platform_balance: totalPlatformBalance,
    },
    recent_rounds: rounds.slice(0, 10).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      regime: r.regime,
      theta: r.theta,
      outcome: r.outcome,
      prize_pool: r.prize_pool,
      opens_at: r.opens_at,
      locks_at: r.locks_at,
    })),
    top_agents: leaderboard.slice(0, 10),
    agents: agents || [],
    recent_events: recentEvents || [],
  });
}
