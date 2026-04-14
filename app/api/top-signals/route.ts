// GET /api/top-signals
// Returns highest-reliability signals from resolved rounds.
// Powers future signal marketplace / subscription features.

import { NextRequest, NextResponse } from "next/server";
import { getTopSignals } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const signals = await getTopSignals(Math.min(limit, 100));

  return NextResponse.json({
    top_signals: signals.map((s) => ({
      id: s.id,
      round_id: s.round_id,
      source_family: s.source_family,
      raw_estimate: s.raw_estimate,
      hidden_reliability: s.hidden_reliability, // revealed post-resolution
      visible_reliability_hint: s.visible_reliability_hint,
      message_text: s.message_text,
    })),
    count: signals.length,
    note: "These are post-resolution revealed signals. High-reliability signals will be available for subscription in a future release.",
  });
}
