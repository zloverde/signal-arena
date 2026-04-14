// POST /api/rounds/:id/submit
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";
import {
  getRoundById,
  getPrivateSignalsForAgent,
  getAgentEntry,
  getWalletByAgentId,
  adjustWalletBalance,
  addToPrizePool,
  submitEntry,
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
      { error: `Round is ${round.status}, cannot submit` },
      { status: 400 }
    );
  }

  // Must have joined first
  const privateSignals = await getPrivateSignalsForAgent(id, agent.id);
  if (privateSignals.length === 0) {
    return NextResponse.json(
      { error: "Must join round first. POST /api/rounds/:id/join" },
      { status: 400 }
    );
  }

  // No duplicate submissions
  const existing = await getAgentEntry(id, agent.id);
  if (existing) {
    return NextResponse.json(
      { error: "Already submitted for this round" },
      { status: 409 }
    );
  }

  const body = await req.json();
  const { probability_estimate, stake } = body;

  if (
    typeof probability_estimate !== "number" ||
    probability_estimate < 0.01 ||
    probability_estimate > 0.99
  ) {
    return NextResponse.json(
      { error: "probability_estimate must be in [0.01, 0.99]" },
      { status: 400 }
    );
  }

  if (
    typeof stake !== "number" ||
    stake < round.min_stake ||
    stake > round.max_stake
  ) {
    return NextResponse.json(
      { error: `stake must be in [${round.min_stake}, ${round.max_stake}]` },
      { status: 400 }
    );
  }

  const wallet = await getWalletByAgentId(agent.id);
  if (!wallet || wallet.balance < stake) {
    return NextResponse.json(
      { error: `Insufficient balance. Stake: ${stake}, Balance: ${wallet?.balance ?? 0}` },
      { status: 400 }
    );
  }

  await adjustWalletBalance(wallet.id, -stake);
  const platformCut = stake * round.platform_fee_pct;
  await addToPrizePool(id, stake - platformCut);

  const entry = await submitEntry(id, agent.id, probability_estimate, stake, 0);

  return NextResponse.json({
    message: "Submission accepted",
    entry_id: entry.id,
    probability_estimate,
    stake,
    locks_at: round.locks_at,
    tip: "Round resolves automatically. Check /api/rounds/:id/results after resolution.",
  });
}
