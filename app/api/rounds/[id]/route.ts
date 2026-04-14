// /api/rounds/[id]/* routes
// GET /api/rounds/:id — round detail with signals
// POST /api/rounds/:id/join — join a round
// POST /api/rounds/:id/submit — submit probability estimate
// POST /api/rounds/:id/purchase-signal — buy a purchasable signal
// GET /api/rounds/:id/results — round results and payouts

import { NextRequest, NextResponse } from "next/server";
import {
  getRoundById,
  getPublicSignals,
  getPrivateSignalsForAgent,
  getAgentPurchases,
  getPurchasableSignals,
  getAgentEntry,
  submitEntry,
  addToPrizePool,
  recordPurchase,
  adjustWalletBalance,
  getWalletByAgentId,
  assignPrivateSignals,
  getPayoutsForRound,
  db,
} from "@/lib/db/client";
import { authenticateAgent } from "@/lib/auth";

function stripHidden(signal: any) {
  const { hidden_reliability, is_trap, ...safe } = signal;
  return safe;
}

// ============================================================
// GET /api/rounds/:id
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const publicSignals = await getPublicSignals(round.id);
  const purchasableSignals = await getPurchasableSignals(round.id);

  // Try to get agent context
  const apiKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  let privateSignals: any[] = [];
  let agentEntry: any = null;
  let purchasedSignals: any[] = [];

  if (apiKey) {
    const { data: agent } = await db
      .from("agents")
      .select("id")
      .eq("api_key", apiKey)
      .single();

    if (agent) {
      privateSignals = await getPrivateSignalsForAgent(round.id, agent.id);
      agentEntry = await getAgentEntry(round.id, agent.id);
      purchasedSignals = await getAgentPurchases(round.id, agent.id);
    }
  }

  const { regime, theta, ...safeRound } = round;

  return NextResponse.json({
    round: {
      ...safeRound,
      // Show outcome only after resolution
      outcome: round.status === "resolved" ? round.outcome : undefined,
    },
    public_signals: publicSignals.map(stripHidden),
    purchasable_signals: purchasableSignals.map((s) => ({
      id: s.id,
      source_family: s.source_family,
      cost: s.cost,
      message_text: `[PURCHASABLE] ${s.source_family.toUpperCase()} signal available. Cost: ${s.cost} credits.`,
    })),
    private_signals: privateSignals.map(stripHidden),
    purchased_signals: purchasedSignals.map(stripHidden),
    agent_entry: agentEntry,
  });
}

// ============================================================
// POST /api/rounds/:id/join
// Agent joins a round — pays entry fee, gets private signals
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();

  if (action === "join") return handleJoin(req, id);
  if (action === "submit") return handleSubmit(req, id);
  if (action === "purchase-signal") return handlePurchase(req, id);

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function handleJoin(req: NextRequest, roundId: string) {
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "open") {
    return NextResponse.json(
      { error: `Round is ${round.status}, cannot join` },
      { status: 400 }
    );
  }

  // Check if already joined (has private signal assignment)
  const existing = await getPrivateSignalsForAgent(roundId, agent.id);
  if (existing.length > 0) {
    return NextResponse.json({
      message: "Already joined this round",
      private_signals: existing.map(stripHidden),
    });
  }

  // Deduct entry fee from wallet
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

  // Add entry fee (minus platform cut) to prize pool
  const platformCut = round.entry_fee * round.platform_fee_pct;
  await addToPrizePool(roundId, round.entry_fee - platformCut);

  // Assign 2 private signals from pool
  const { data: privatePool } = await db
    .from("signals")
    .select("id")
    .eq("round_id", roundId)
    .eq("visibility", "private");

  if (!privatePool || privatePool.length < 2) {
    return NextResponse.json(
      { error: "Signal pool unavailable" },
      { status: 500 }
    );
  }

  // Pick 2 signals: first not already assigned to this agent
  const { data: existingAssignments } = await db
    .from("private_signal_assignments")
    .select("signal_id")
    .eq("round_id", roundId)
    .eq("agent_id", agent.id);

  const assignedIds = new Set((existingAssignments || []).map((a: any) => a.signal_id));
  const available = privatePool.filter((s: any) => !assignedIds.has(s.id));

  // Each agent gets signals from their portion of the pool
  // Use modulo to distribute across agents
  const { data: allAgentCount } = await db
    .from("private_signal_assignments")
    .select("agent_id")
    .eq("round_id", roundId);

  const agentIndex = new Set((allAgentCount || []).map((a: any) => a.agent_id)).size;
  const poolSize = privatePool.length;
  const idx1 = (agentIndex * 2) % poolSize;
  const idx2 = (agentIndex * 2 + 1) % poolSize;

  const signalIds = [
    privatePool[idx1].id,
    privatePool[Math.min(idx2, poolSize - 1)].id,
  ].filter((id) => !assignedIds.has(id));

  if (signalIds.length === 0) {
    // Fallback: give any 2 from available
    signalIds.push(...available.slice(0, 2).map((s: any) => s.id));
  }

  await assignPrivateSignals(roundId, agent.id, signalIds.slice(0, 2));

  const privateSignals = await getPrivateSignalsForAgent(roundId, agent.id);

  return NextResponse.json({
    message: "Joined round successfully",
    entry_fee_paid: round.entry_fee,
    private_signals: privateSignals.map(stripHidden),
  });
}

async function handleSubmit(req: NextRequest, roundId: string) {
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const round = await getRoundById(roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.status !== "open") {
    return NextResponse.json(
      { error: `Round is ${round.status}, cannot submit` },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { probability_estimate, stake } = body;

  // Validate inputs
  if (
    typeof probability_estimate !== "number" ||
    probability_estimate < 0.01 ||
    probability_estimate > 0.99
  ) {
    return NextResponse.json(
      { error: "probability_estimate must be a number in [0.01, 0.99]" },
      { status: 400 }
    );
  }
  if (
    typeof stake !== "number" ||
    stake < round.min_stake ||
    stake > round.max_stake
  ) {
    return NextResponse.json(
      {
        error: `stake must be between ${round.min_stake} and ${round.max_stake}`,
      },
      { status: 400 }
    );
  }

  // Check agent has joined (has private signals)
  const privateSignals = await getPrivateSignalsForAgent(roundId, agent.id);
  if (privateSignals.length === 0) {
    return NextResponse.json(
      { error: "Must join round first before submitting" },
      { status: 400 }
    );
  }

  // Check not already submitted
  const existing = await getAgentEntry(roundId, agent.id);
  if (existing) {
    return NextResponse.json(
      { error: "Already submitted for this round" },
      { status: 409 }
    );
  }

  // Deduct stake from wallet
  const wallet = await getWalletByAgentId(agent.id);
  if (!wallet || wallet.balance < stake) {
    return NextResponse.json(
      { error: "Insufficient balance for stake" },
      { status: 400 }
    );
  }

  await adjustWalletBalance(wallet.id, -stake);

  // Platform takes fee from stake pool; rest goes to prize pool
  const platformCut = stake * round.platform_fee_pct;
  await addToPrizePool(roundId, stake - platformCut);

  const entry = await submitEntry(
    roundId,
    agent.id,
    probability_estimate,
    stake,
    0 // entry fee already paid on join
  );

  return NextResponse.json({
    message: "Submission accepted",
    entry_id: entry.id,
    probability_estimate,
    stake,
    locks_at: round.locks_at,
  });
}

async function handlePurchase(req: NextRequest, roundId: string) {
  const authResult = await authenticateAgent(req);
  if (authResult instanceof NextResponse) return authResult;
  const { agent } = authResult;

  const round = await getRoundById(roundId);
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

  // Verify signal exists and is purchasable in this round
  const { data: signal } = await db
    .from("signals")
    .select("*")
    .eq("id", signal_id)
    .eq("round_id", roundId)
    .eq("visibility", "purchasable")
    .single();

  if (!signal) {
    return NextResponse.json(
      { error: "Signal not found or not purchasable" },
      { status: 404 }
    );
  }

  // Check not already purchased
  const { data: existing } = await db
    .from("purchases")
    .select("id")
    .eq("round_id", roundId)
    .eq("agent_id", agent.id)
    .eq("signal_id", signal_id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "Signal already purchased" },
      { status: 409 }
    );
  }

  // Deduct cost from wallet
  const wallet = await getWalletByAgentId(agent.id);
  if (!wallet || wallet.balance < signal.cost) {
    return NextResponse.json(
      { error: `Insufficient balance. Signal costs ${signal.cost} credits` },
      { status: 400 }
    );
  }

  await adjustWalletBalance(wallet.id, -signal.cost);
  await recordPurchase(roundId, agent.id, signal_id, signal.cost);

  const { hidden_reliability, is_trap, ...safeSignal } = signal;

  return NextResponse.json({
    message: "Signal purchased",
    signal: safeSignal,
  });
}
