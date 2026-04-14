// GET /api/leaderboard
import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const leaderboard = await getLeaderboard(Math.min(limit, 100));

  return NextResponse.json({
    leaderboard,
    count: leaderboard.length,
    description: "Ranked by total profit. ROI and calibration error also tracked.",
  });
}
