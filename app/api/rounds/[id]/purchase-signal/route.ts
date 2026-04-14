// POST /api/rounds/:id/purchase-signal
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import {
  getRoundById,
  getWalletByAgentId,
  adjustWalletBalance,
  recordPurchase,
  db,
} from "@/lib/db/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "open") {
    return NextResponse.json(
      { error: "Round not open for purchases" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { signal_id } = body;
  if (!signal_id) {
    return NextResponse.json({ error: "signal_id required" }, { status: 400 });
  }

  const { data: signal } = await db
    .from("signals")
    .select("*")
    .eq("id", signal_id)
    .eq("round_id", id)
    .eq("visibility", "purchasable")
    .single();

  if (!signal) {
    return NextResponse.json(
      { error: "Signal not found or not purchasable in this round" },
      { status: 404 }
    );
  }

  const { data: existing } = await db
    .from("purchases")
    .select("id")
    .eq("round_id", id)
    .eq("agent_id", agent.id)
    .eq("signal_id", signal_id)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Signal already purchased" }, { status: 409 });
  }

  const wallet = await getWalletByAgentId(agent.id);
  if (!wallet || wallet.balance < signal.cost) {
    return NextResponse.json(
      { error: `Insufficient balance. Cost: ${signal.cost}, Balance: ${wallet?.balance ?? 0}` },
      { status: 400 }
    );
  }

  await adjustWalletBalance(wallet.id, -signal.cost);
  await recordPurchase(id, agent.id, signal_id, signal.cost);

  // Return full signal (without hidden reliability)
  const { hidden_reliability, is_trap, ...safeSignal } = signal;

  return NextResponse.json({
    message: "Signal purchased successfully",
    price_paid: signal.cost,
    signal: safeSignal,
  });
}
