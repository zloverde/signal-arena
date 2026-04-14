// ============================================================
// Signal Arena — Database Client
// Thin wrapper around Supabase client with typed helpers
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type {
  Agent,
  Wallet,
  Round,
  Signal,
  Entry,
  Purchase,
  Payout,
  LeaderboardEntry,
  PrivateSignalAssignment,
} from "../../types/index";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Service key for server-side operations (bypasses RLS)
export const db = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// Agents
// ============================================================

export async function getAgentByApiKey(apiKey: string): Promise<Agent | null> {
  const { data } = await db
    .from("agents")
    .select("*")
    .eq("api_key", apiKey)
    .single();
  return data;
}

export async function getAgentById(id: string): Promise<Agent | null> {
  const { data } = await db.from("agents").select("*").eq("id", id).single();
  return data;
}

export async function createAgent(name: string, email?: string): Promise<Agent> {
  const apiKey = generateApiKey();
  const { data, error } = await db
    .from("agents")
    .insert({ name, email, api_key: apiKey })
    .select()
    .single();
  if (error) throw new Error(`Failed to create agent: ${error.message}`);
  return data;
}

// ============================================================
// Wallets
// ============================================================

export async function createWallet(agentId: string): Promise<Wallet> {
  const { data, error } = await db
    .from("wallets")
    .insert({ agent_id: agentId, balance: 1000 })
    .select()
    .single();
  if (error) throw new Error(`Failed to create wallet: ${error.message}`);
  return data;
}

export async function getWalletByAgentId(agentId: string): Promise<Wallet | null> {
  const { data } = await db
    .from("wallets")
    .select("*")
    .eq("agent_id", agentId)
    .single();
  return data;
}

export async function adjustWalletBalance(
  walletId: string,
  delta: number
): Promise<void> {
  const { error } = await db.rpc("adjust_wallet_balance", {
    p_wallet_id: walletId,
    p_delta: delta,
  });
  // Fallback if RPC not available: fetch then update
  if (error) {
    const { data: wallet } = await db
      .from("wallets")
      .select("balance")
      .eq("id", walletId)
      .single();
    if (!wallet) throw new Error("Wallet not found");
    await db
      .from("wallets")
      .update({ balance: wallet.balance + delta })
      .eq("id", walletId);
  }
}

// ============================================================
// Rounds
// ============================================================

export async function getRounds(status?: string): Promise<Round[]> {
  let query = db.from("rounds").select("*").order("opens_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return data || [];
}

export async function getRoundById(id: string): Promise<Round | null> {
  const { data } = await db.from("rounds").select("*").eq("id", id).single();
  return data;
}

export async function createRound(round: Omit<Round, "id" | "created_at" | "prize_pool">): Promise<Round> {
  const { data, error } = await db
    .from("rounds")
    .insert({ ...round, prize_pool: 0 })
    .select()
    .single();
  if (error) throw new Error(`Failed to create round: ${error.message}`);
  return data;
}

export async function updateRoundStatus(
  id: string,
  status: string,
  outcome?: number
): Promise<void> {
  const update: any = { status };
  if (outcome !== undefined) {
    update.outcome = outcome;
    update.resolves_at = new Date().toISOString();
  }
  await db.from("rounds").update(update).eq("id", id);
}

export async function addToPrizePool(
  roundId: string,
  amount: number
): Promise<void> {
  const { data: round } = await db
    .from("rounds")
    .select("prize_pool")
    .eq("id", roundId)
    .single();
  if (round) {
    await db
      .from("rounds")
      .update({ prize_pool: round.prize_pool + amount })
      .eq("id", roundId);
  }
}

// ============================================================
// Signals
// ============================================================

export async function insertSignals(
  signals: Omit<Signal, "id">[]
): Promise<Signal[]> {
  const { data, error } = await db.from("signals").insert(signals).select();
  if (error) throw new Error(`Failed to insert signals: ${error.message}`);
  return data;
}

export async function getPublicSignals(roundId: string): Promise<Signal[]> {
  const { data } = await db
    .from("signals")
    .select("*")
    .eq("round_id", roundId)
    .eq("visibility", "public");
  return data || [];
}

export async function getPurchasableSignals(roundId: string): Promise<Signal[]> {
  const { data } = await db
    .from("signals")
    .select("*")
    .eq("round_id", roundId)
    .eq("visibility", "purchasable");
  // Strip hidden_reliability before returning
  return (data || []).map(stripHiddenFields);
}

export async function getPrivateSignalsForAgent(
  roundId: string,
  agentId: string
): Promise<Signal[]> {
  const { data: assignments } = await db
    .from("private_signal_assignments")
    .select("signal_id")
    .eq("round_id", roundId)
    .eq("agent_id", agentId);

  if (!assignments || assignments.length === 0) return [];

  const signalIds = assignments.map((a: any) => a.signal_id);
  const { data } = await db
    .from("signals")
    .select("*")
    .in("id", signalIds);

  return (data || []).map(stripHiddenFields);
}

export async function assignPrivateSignals(
  roundId: string,
  agentId: string,
  signalIds: string[]
): Promise<void> {
  const assignments = signalIds.map((signal_id) => ({
    round_id: roundId,
    agent_id: agentId,
    signal_id,
  }));
  await db.from("private_signal_assignments").insert(assignments);
}

// Remove fields that agents should never see
function stripHiddenFields(signal: Signal): Signal {
  const { hidden_reliability, ...rest } = signal as any;
  return rest;
}

// ============================================================
// Entries
// ============================================================

export async function submitEntry(
  roundId: string,
  agentId: string,
  probabilityEstimate: number,
  stake: number,
  feePaid: number
): Promise<Entry> {
  const { data, error } = await db
    .from("entries")
    .insert({
      round_id: roundId,
      agent_id: agentId,
      probability_estimate: probabilityEstimate,
      stake,
      fee_paid: feePaid,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to submit entry: ${error.message}`);
  return data;
}

export async function getEntriesForRound(roundId: string): Promise<Entry[]> {
  const { data } = await db
    .from("entries")
    .select("*")
    .eq("round_id", roundId);
  return data || [];
}

export async function getAgentEntry(
  roundId: string,
  agentId: string
): Promise<Entry | null> {
  const { data } = await db
    .from("entries")
    .select("*")
    .eq("round_id", roundId)
    .eq("agent_id", agentId)
    .single();
  return data;
}

// ============================================================
// Purchases
// ============================================================

export async function recordPurchase(
  roundId: string,
  agentId: string,
  signalId: string,
  price: number
): Promise<Purchase> {
  const { data, error } = await db
    .from("purchases")
    .insert({
      round_id: roundId,
      agent_id: agentId,
      signal_id: signalId,
      price_paid: price,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to record purchase: ${error.message}`);
  return data;
}

export async function getAgentPurchases(
  roundId: string,
  agentId: string
): Promise<Signal[]> {
  const { data: purchases } = await db
    .from("purchases")
    .select("signal_id")
    .eq("round_id", roundId)
    .eq("agent_id", agentId);

  if (!purchases || purchases.length === 0) return [];

  const signalIds = purchases.map((p: any) => p.signal_id);
  const { data } = await db.from("signals").select("*").in("id", signalIds);
  return (data || []).map(stripHiddenFields);
}

// ============================================================
// Payouts
// ============================================================

export async function insertPayouts(
  payouts: Omit<Payout, "id" | "created_at">[]
): Promise<void> {
  if (payouts.length === 0) return;
  const { error } = await db.from("payouts").insert(payouts);
  if (error) throw new Error(`Failed to insert payouts: ${error.message}`);
}

export async function getPayoutsForRound(roundId: string): Promise<Payout[]> {
  const { data } = await db
    .from("payouts")
    .select("*, agents(name)")
    .eq("round_id", roundId);
  return data || [];
}

// ============================================================
// Leaderboard
// ============================================================

export async function updateLeaderboard(agentId: string): Promise<void> {
  // Aggregate stats from payouts and entries
  const { data: payoutData } = await db
    .from("payouts")
    .select("profit_loss, raw_score, payout_amount")
    .eq("agent_id", agentId);

  const { data: entryData } = await db
    .from("entries")
    .select("stake, probability_estimate")
    .eq("agent_id", agentId);

  const { data: agent } = await db
    .from("agents")
    .select("name, reputation_score")
    .eq("id", agentId)
    .single();

  if (!agent || !payoutData) return;

  const totalRounds = payoutData.length;
  const totalProfit = payoutData.reduce((a: number, p: any) => a + p.profit_loss, 0);
  const totalStaked = (entryData || []).reduce((a: number, e: any) => a + e.stake, 0);
  const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
  const avgScore =
    totalRounds > 0
      ? payoutData.reduce((a: number, p: any) => a + p.raw_score, 0) / totalRounds
      : 0;

  // Calibration error: MSE of estimates vs outcomes
  const { data: outcomeData } = await db
    .from("payouts")
    .select("entries(probability_estimate), rounds(outcome)")
    .eq("agent_id", agentId);

  let calibrationError = 0;
  if (outcomeData && outcomeData.length > 0) {
    const mse =
      outcomeData.reduce((acc: number, row: any) => {
        const p = row.entries?.probability_estimate ?? 0.5;
        const y = row.rounds?.outcome ?? 0;
        return acc + Math.pow(p - y, 2);
      }, 0) / outcomeData.length;
    calibrationError = mse;
  }

  await db.from("leaderboard_snapshots").upsert(
    {
      agent_id: agentId,
      agent_name: agent.name,
      total_rounds: totalRounds,
      total_staked: totalStaked,
      total_profit: totalProfit,
      roi,
      avg_score: avgScore,
      calibration_error: calibrationError,
      reputation_score: agent.reputation_score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id" }
  );

  // Re-rank all agents
  await recomputeRanks();
}

async function recomputeRanks(): Promise<void> {
  const { data } = await db
    .from("leaderboard_snapshots")
    .select("agent_id, total_profit")
    .order("total_profit", { ascending: false });

  if (!data) return;

  const updates = data.map((row: any, i: number) => ({
    agent_id: row.agent_id,
    rank: i + 1,
  }));

  for (const update of updates) {
    await db
      .from("leaderboard_snapshots")
      .update({ rank: update.rank })
      .eq("agent_id", update.agent_id);
  }
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { data } = await db
    .from("leaderboard_snapshots")
    .select("*")
    .order("rank", { ascending: true })
    .limit(limit);
  return data || [];
}

// ============================================================
// Top signals feed
// Returns signals that had high hidden_reliability after resolution
// (revealed post-resolution for future marketplace)
// ============================================================
export async function getTopSignals(limit = 20): Promise<Signal[]> {
  const { data } = await db
    .from("signals")
    .select("*, rounds!inner(status)")
    .eq("rounds.status", "resolved")
    .gte("hidden_reliability", 0.70)
    .order("hidden_reliability", { ascending: false })
    .limit(limit);
  return data || [];
}

// ============================================================
// Outcome recording
// ============================================================
export async function recordOutcome(
  roundId: string,
  realizedY: number,
  theta: number,
  regime: string
): Promise<void> {
  await db.from("outcomes").insert({
    round_id: roundId,
    realized_y: realizedY,
    theta,
    regime,
  });
}

// ============================================================
// Admin events log
// ============================================================
export async function logAdminEvent(
  eventType: string,
  roundId?: string,
  agentId?: string,
  details?: object
): Promise<void> {
  await db.from("admin_events").insert({
    event_type: eventType,
    round_id: roundId,
    agent_id: agentId,
    details,
  });
}

// ============================================================
// Utilities
// ============================================================

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "sa_";
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export { generateApiKey };
