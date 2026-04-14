// POST /api/rounds/:id/join
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "../../../../../lib/auth";
import {
  getRoundById,
  getPrivateSignalsForAgent,
  getWalletByAgentId,
  adjustWalletBalance,
  addToPrizePool,
  assignPrivateSignals,
  db,
} from "../../../../../lib/db/client";

function stripHidden(signal: any) {
  const { hidden_reliability, is_trap, ...safe } = signal;
  return safe;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const round = await getRoundById(params.id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "open") {
    return NextResponse.json(
      { error: `Round is ${round.status}, cannot join` },
      { status: 400 }
    );
  }

  // Check if already joined
  const existing = await getPrivateSignalsForAgent(params.id, agent.id);
  if (existing.length > 0) {
    return NextResponse.json({
      message: "Already joined this round",
      private_signals: existing.map(stripHidden),
    });
  }

  // Check wallet balance
  const wallet = await getWalletByAgentId(agent.id);
  if (!wallet) {
    return NextResponse.json({ error: "No wallet found" }, { status: 400 });
  }
  if (wallet.balance < round.entry_fee) {
    return NextResponse.json(
      { error: `Insufficient balance. Required: ${round.entry_fee}, Have: ${wallet.balance}` },
      { status: 400 }
    );
  }

  await adjustWalletBalance(wallet.id, -round.entry_fee);
  const platformCut = round.entry_fee * round.platform_fee_pct;
  await addToPrizePool(params.id, round.entry_fee - platformCut);

  // Assign private signals
  const { data: privatePool } = await db
    .from("signals")
    .select("id")
    .eq("round_id", params.id)
    .eq("visibility", "private");

  if (!privatePool || privatePool.length < 2) {
    return NextResponse.json({ error: "Signal pool unavailable" }, { status: 500 });
  }

  // Distribute signals across agents: count existing assignments to determine offset
  const { data: existingCount } = await db
    .from("private_signal_assignments")
    .select("agent_id")
    .eq("round_id", params.id);

  const agentIndex = new Set((existingCount || []).map((a: any) => a.agent_id)).size;
  const poolSize = privatePool.length;
  const idx1 = (agentIndex * 2) % poolSize;
  const idx2 = (agentIndex * 2 + 1) % poolSize;

  const signalIds = [
    privatePool[idx1].id,
    privatePool[Math.min(idx2, poolSize - 1)].id,
  ];

  await assignPrivateSignals(params.id, agent.id, signalIds);
  const privateSignals = await getPrivateSignalsForAgent(params.id, agent.id);

  return NextResponse.json({
    message: "Joined round successfully",
    entry_fee_paid: round.entry_fee,
    private_signals: privateSignals.map(stripHidden),
    next_step: `Submit your probability estimate via POST /api/rounds/${params.id}/submit`,
  });
}
