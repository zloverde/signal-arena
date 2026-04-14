import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Agent, Entry, LeaderboardEntry, Round, Signal, Wallet } from "@/types/index";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const db: SupabaseClient = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_KEY")
);

function num(x: unknown, fallback = 0): number {
  if (x === null || x === undefined) return fallback;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function toRound(row: Record<string, unknown>): Round {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    status: row.status as Round["status"],
    regime: row.regime as Round["regime"],
    theta: num(row.theta),
    outcome: row.outcome === null || row.outcome === undefined ? undefined : num(row.outcome),
    entry_fee: num(row.entry_fee),
    min_stake: num(row.min_stake),
    max_stake: num(row.max_stake),
    platform_fee_pct: num(row.platform_fee_pct),
    prize_pool: num(row.prize_pool),
    opens_at: String(row.opens_at),
    locks_at: String(row.locks_at),
    resolves_at: row.resolves_at ? String(row.resolves_at) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    category: String(row.category ?? "general"),
    source_drift_seed: num(row.source_drift_seed),
  };
}

function toSignal(row: Record<string, unknown>): Signal {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    source_family: row.source_family as Signal["source_family"],
    visibility: row.visibility as Signal["visibility"],
    raw_estimate: num(row.raw_estimate),
    hidden_reliability: num(row.hidden_reliability),
    visible_reliability_hint: num(row.visible_reliability_hint),
    noise_level: num(row.noise_level),
    cost: num(row.cost),
    message_text: String(row.message_text),
    is_trap: Boolean(row.is_trap),
  };
}

function toEntry(row: Record<string, unknown>): Entry {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    agent_id: String(row.agent_id),
    probability_estimate: num(row.probability_estimate),
    stake: num(row.stake),
    submitted_at: String(row.submitted_at ?? new Date().toISOString()),
    fee_paid: num(row.fee_paid),
  };
}

function toWallet(row: Record<string, unknown>): Wallet {
  return {
    id: String(row.id),
    agent_id: String(row.agent_id),
    balance: num(row.balance),
    address: row.address ? String(row.address) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getRounds(status?: string): Promise<Round[]> {
  let q = db.from("rounds").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toRound(r as Record<string, unknown>));
}

export async function getRoundById(id: string): Promise<Round | null> {
  const { data, error } = await db.from("rounds").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toRound(data as Record<string, unknown>);
}

export async function getLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const { data, error } = await db
    .from("leaderboard_snapshots")
    .select("*")
    .order("total_profit", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  let rank = 1;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    agent_id: String(row.agent_id),
    agent_name: String(row.agent_name),
    total_rounds: num(row.total_rounds),
    total_profit: num(row.total_profit),
    roi: num(row.roi),
    avg_score: num(row.avg_score),
    calibration_error: num(row.calibration_error),
    reputation_score: num(row.reputation_score),
    rank: rank++,
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  }));
}

export async function getEntriesForRound(roundId: string): Promise<Entry[]> {
  const { data, error } = await db.from("entries").select("*").eq("round_id", roundId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => toEntry(e as Record<string, unknown>));
}

export async function updateRoundStatus(
  roundId: string,
  status: string,
  outcome?: number
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (outcome !== undefined) patch.outcome = outcome;
  if (status === "resolved") patch.resolves_at = new Date().toISOString();
  const { error } = await db.from("rounds").update(patch).eq("id", roundId);
  if (error) throw new Error(error.message);
}

export async function recordOutcome(
  roundId: string,
  realizedY: number,
  theta: number,
  regime: string
): Promise<void> {
  const { error } = await db.from("outcomes").insert({
    round_id: roundId,
    realized_y: realizedY,
    theta,
    regime,
  });
  if (error) throw new Error(error.message);
}

export async function insertPayouts(
  rows: Array<{
    round_id: string;
    agent_id: string;
    entry_id: string;
    raw_score: number;
    normalized_score: number;
    payout_amount: number;
    profit_loss: number;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("payouts").insert(rows);
  if (error) throw new Error(error.message);
}

export async function logAdminEvent(
  event_type: string,
  round_id?: string,
  agent_id?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from("admin_events").insert({
    event_type,
    round_id: round_id ?? null,
    agent_id: agent_id ?? null,
    details: details ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function createRound(fields: {
  title: string;
  description: string;
  category: string;
  opens_at: string;
  locks_at: string;
  entry_fee: number;
  min_stake: number;
  max_stake: number;
  platform_fee_pct: number;
  regime: string;
  theta: number;
  status: string;
  source_drift_seed: number;
}): Promise<Round> {
  const { data, error } = await db
    .from("rounds")
    .insert({
      ...fields,
      prize_pool: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toRound(data as Record<string, unknown>);
}

type SignalInsert = Omit<Signal, "id"> & { round_id: string };

export async function insertSignals(signals: SignalInsert[]): Promise<void> {
  if (signals.length === 0) return;
  const { error } = await db.from("signals").insert(signals);
  if (error) throw new Error(error.message);
}

export async function getPublicSignals(roundId: string): Promise<Signal[]> {
  const { data, error } = await db
    .from("signals")
    .select("*")
    .eq("round_id", roundId)
    .eq("visibility", "public")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => toSignal(s as Record<string, unknown>));
}

export async function getPurchasableSignals(roundId: string): Promise<Signal[]> {
  const { data, error } = await db
    .from("signals")
    .select("*")
    .eq("round_id", roundId)
    .eq("visibility", "purchasable");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => toSignal(s as Record<string, unknown>));
}

export async function getPrivateSignalsForAgent(
  roundId: string,
  agentId: string
): Promise<Signal[]> {
  const { data: assigns, error: e1 } = await db
    .from("private_signal_assignments")
    .select("signal_id")
    .eq("round_id", roundId)
    .eq("agent_id", agentId);
  if (e1) throw new Error(e1.message);
  const ids = (assigns ?? []).map((a: { signal_id: string }) => a.signal_id);
  if (ids.length === 0) return [];
  const { data: sigs, error: e2 } = await db.from("signals").select("*").in("id", ids);
  if (e2) throw new Error(e2.message);
  return (sigs ?? []).map((s) => toSignal(s as Record<string, unknown>));
}

export async function getAgentPurchases(
  roundId: string,
  agentId: string
): Promise<Signal[]> {
  const { data: purchases, error: e1 } = await db
    .from("purchases")
    .select("signal_id")
    .eq("round_id", roundId)
    .eq("agent_id", agentId);
  if (e1) throw new Error(e1.message);
  const ids = (purchases ?? []).map((p: { signal_id: string }) => p.signal_id);
  if (ids.length === 0) return [];
  const { data: sigs, error: e2 } = await db.from("signals").select("*").in("id", ids);
  if (e2) throw new Error(e2.message);
  return (sigs ?? []).map((s) => toSignal(s as Record<string, unknown>));
}

export async function getAgentEntry(
  roundId: string,
  agentId: string
): Promise<Entry | null> {
  const { data, error } = await db
    .from("entries")
    .select("*")
    .eq("round_id", roundId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toEntry(data as Record<string, unknown>);
}

export async function getWalletByAgentId(agentId: string): Promise<Wallet | null> {
  const { data, error } = await db.from("wallets").select("*").eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toWallet(data as Record<string, unknown>);
}

export async function adjustWalletBalance(walletId: string, delta: number): Promise<void> {
  const { data: w, error: e1 } = await db
    .from("wallets")
    .select("balance")
    .eq("id", walletId)
    .single();
  if (e1) throw new Error(e1.message);
  const next = num(w?.balance) + delta;
  const { error: e2 } = await db
    .from("wallets")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("id", walletId);
  if (e2) throw new Error(e2.message);
}

export async function addToPrizePool(roundId: string, amount: number): Promise<void> {
  const round = await getRoundById(roundId);
  if (!round) throw new Error("Round not found");
  const { error } = await db
    .from("rounds")
    .update({ prize_pool: round.prize_pool + amount })
    .eq("id", roundId);
  if (error) throw new Error(error.message);
}

export async function submitEntry(
  roundId: string,
  agentId: string,
  probability_estimate: number,
  stake: number,
  fee_paid: number
): Promise<Entry> {
  const { data, error } = await db
    .from("entries")
    .insert({
      round_id: roundId,
      agent_id: agentId,
      probability_estimate,
      stake,
      fee_paid,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toEntry(data as Record<string, unknown>);
}

export async function assignPrivateSignals(
  roundId: string,
  agentId: string,
  signalIds: string[]
): Promise<void> {
  const rows = signalIds.map((signal_id) => ({
    round_id: roundId,
    agent_id: agentId,
    signal_id,
  }));
  const { error } = await db.from("private_signal_assignments").insert(rows);
  if (error) throw new Error(error.message);
}

export async function recordPurchase(
  roundId: string,
  agentId: string,
  signalId: string,
  pricePaid: number
): Promise<void> {
  const { error } = await db.from("purchases").insert({
    round_id: roundId,
    agent_id: agentId,
    signal_id: signalId,
    price_paid: pricePaid,
  });
  if (error) throw new Error(error.message);
}

export async function getPayoutsForRound(roundId: string): Promise<
  Array<{
    payout_amount: number;
    profit_loss: number;
    raw_score: number;
    agents?: { name: string };
  }>
> {
  const { data, error } = await db
    .from("payouts")
    .select("payout_amount, profit_loss, raw_score, agents(name)")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
    payout_amount: number;
    profit_loss: number;
    raw_score: number;
    agents?: { name: string };
  }>;
}

export async function getTopSignals(limit: number): Promise<Signal[]> {
  const { data: resolvedRounds, error: e1 } = await db
    .from("rounds")
    .select("id")
    .eq("status", "resolved");
  if (e1) throw new Error(e1.message);
  const roundIds = (resolvedRounds ?? []).map((r: { id: string }) => r.id);
  if (roundIds.length === 0) return [];
  const { data, error: e2 } = await db
    .from("signals")
    .select("*")
    .in("round_id", roundIds)
    .order("hidden_reliability", { ascending: false })
    .limit(limit);
  if (e2) throw new Error(e2.message);
  return (data ?? []).map((s) => toSignal(s as Record<string, unknown>));
}

function randomApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "sa_";
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createAgent(name: string, email?: string): Promise<Agent> {
  const { data, error } = await db
    .from("agents")
    .insert({
      name,
      api_key: randomApiKey(),
      email: email ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name),
    api_key: String(row.api_key),
    email: row.email ? String(row.email) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    reputation_score: num(row.reputation_score, 1000),
    total_rounds: num(row.total_rounds),
    total_wins: num(row.total_wins),
  };
}

export async function createWallet(agentId: string): Promise<Wallet> {
  const { data, error } = await db
    .from("wallets")
    .insert({ agent_id: agentId, balance: 1000 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toWallet(data as Record<string, unknown>);
}

export async function updateLeaderboard(agentId: string): Promise<void> {
  const { data: agent, error: e0 } = await db
    .from("agents")
    .select("name, reputation_score, total_rounds")
    .eq("id", agentId)
    .single();
  if (e0 || !agent) return;

  const { data: payoutRows } = await db
    .from("payouts")
    .select("profit_loss, raw_score")
    .eq("agent_id", agentId);
  const { data: entryRows } = await db.from("entries").select("stake").eq("agent_id", agentId);

  const payouts = payoutRows ?? [];
  const entries = entryRows ?? [];

  const total_profit = payouts.reduce((a: number, p: { profit_loss: number }) => a + num(p.profit_loss), 0);
  const total_staked = entries.reduce((a: number, e: { stake: number }) => a + num(e.stake), 0);
  const roi = total_staked > 0 ? total_profit / total_staked : 0;
  const avg_score =
    payouts.length > 0
      ? payouts.reduce((a: number, p: { raw_score: number }) => a + num(p.raw_score), 0) / payouts.length
      : 0;

  const { data: agentEntries } = await db
    .from("entries")
    .select("probability_estimate, round_id")
    .eq("agent_id", agentId);

  let calibration_error = 0;
  const ae = agentEntries ?? [];
  if (ae.length > 0) {
    const rids = [...new Set(ae.map((e: { round_id: string }) => e.round_id))];
    const { data: resolvedRounds } = await db
      .from("rounds")
      .select("id, outcome")
      .in("id", rids)
      .eq("status", "resolved");
    const outcomeByRound = new Map(
      (resolvedRounds ?? []).map((r: { id: string; outcome: number | null }) => [
        r.id,
        r.outcome === null || r.outcome === undefined ? null : num(r.outcome),
      ])
    );
    const errors: number[] = [];
    for (const row of ae as Array<{ probability_estimate: number; round_id: string }>) {
      const y = outcomeByRound.get(row.round_id);
      if (y === null || y === undefined) continue;
      errors.push(Math.pow(num(row.probability_estimate) - y, 2));
    }
    if (errors.length > 0) {
      calibration_error = errors.reduce((a, b) => a + b, 0) / errors.length;
    }
  }

  await db.from("leaderboard_snapshots").upsert(
    {
      agent_id: agentId,
      agent_name: (agent as { name: string }).name,
      total_rounds: num((agent as { total_rounds: number }).total_rounds),
      total_staked,
      total_profit,
      roi,
      avg_score,
      calibration_error,
      reputation_score: num((agent as { reputation_score: number }).reputation_score),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "agent_id" }
  );
}
