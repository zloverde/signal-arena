// ============================================================
// Signal Arena — Core Types
// ============================================================

export type Regime = "stable_trend" | "mean_reversion" | "shock_event";

export type SourceFamily =
  | "trend"
  | "fundamental"
  | "contrarian"
  | "insider"
  | "meta_reliability";

export type SignalVisibility = "public" | "private" | "purchasable";

export type RoundStatus =
  | "draft"
  | "open"
  | "locked"
  | "resolved"
  | "cancelled";

export type AgentArchetype = "sharp" | "average" | "overconfident" | "random";

// ============================================================
// Database row types (mirrors Supabase schema)
// ============================================================

export interface Agent {
  id: string;
  name: string;
  api_key: string;
  email?: string;
  created_at: string;
  wallet_id?: string;
  reputation_score: number;
  total_rounds: number;
  total_wins: number;
  archetype?: AgentArchetype; // for simulation only
}

export interface Wallet {
  id: string;
  agent_id: string;
  balance: number;
  address?: string; // future onchain linkage
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  title: string;
  description: string;
  status: RoundStatus;
  regime: Regime; // hidden from agents
  theta: number; // hidden true probability
  outcome?: number; // 0 or 1, set on resolution
  entry_fee: number;
  min_stake: number;
  max_stake: number;
  platform_fee_pct: number; // e.g. 0.05 = 5%
  prize_pool: number; // accumulated from entries
  opens_at: string;
  locks_at: string;
  resolves_at?: string;
  created_at: string;
  category: string; // e.g. "market", "science", "geopolitical"
  source_drift_seed: number; // shifts source reliabilities over time
}

export interface Signal {
  id: string;
  round_id: string;
  source_family: SourceFamily;
  visibility: SignalVisibility;
  raw_estimate: number; // signal's probability estimate
  hidden_reliability: number; // true quality, hidden from agents
  visible_reliability_hint: number; // noisy version shown to agents
  noise_level: number; // how much noise added
  cost: number; // in credits, 0 for public/private
  message_text: string; // human-readable description
  is_trap: boolean; // intentionally misleading signal
}

export interface PrivateSignalAssignment {
  id: string;
  round_id: string;
  agent_id: string;
  signal_id: string;
  delivered_at: string;
}

export interface Entry {
  id: string;
  round_id: string;
  agent_id: string;
  probability_estimate: number; // p in [0.01, 0.99]
  stake: number;
  submitted_at: string;
  fee_paid: number;
}

export interface Purchase {
  id: string;
  round_id: string;
  agent_id: string;
  signal_id: string;
  price_paid: number;
  purchased_at: string;
}

export interface Outcome {
  id: string;
  round_id: string;
  realized_y: number; // 0 or 1
  theta: number;
  regime: Regime;
  resolved_at: string;
}

export interface Payout {
  id: string;
  round_id: string;
  agent_id: string;
  entry_id: string;
  raw_score: number;
  normalized_score: number;
  payout_amount: number;
  profit_loss: number;
  created_at: string;
}

export interface LeaderboardEntry {
  agent_id: string;
  agent_name: string;
  total_rounds: number;
  total_profit: number;
  roi: number; // total_profit / total_staked
  avg_score: number;
  calibration_error: number; // mean squared error of estimates
  reputation_score: number;
  rank: number;
  updated_at: string;
}

// ============================================================
// API request/response types
// ============================================================

export interface RegisterAgentRequest {
  name: string;
  email?: string;
}

export interface RegisterAgentResponse {
  agent_id: string;
  api_key: string;
  wallet_id: string;
  initial_balance: number;
}

export interface SubmitEntryRequest {
  probability_estimate: number;
  stake: number;
}

export interface RoundWithSignals extends Round {
  public_signals: Signal[];
  private_signals?: Signal[]; // only for the requesting agent
  purchased_signals?: Signal[]; // signals this agent has bought
  agent_entry?: Entry; // this agent's submission if any
}

export interface SimulationResult {
  rounds_simulated: number;
  agent_results: AgentSimResult[];
  signal_family_performance: Record<SourceFamily, Record<Regime, number>>;
  purchased_signal_value: number; // avg improvement from buying
}

export interface AgentSimResult {
  archetype: AgentArchetype;
  total_profit: number;
  roi: number;
  avg_score: number;
  win_rate: number;
  calibration_error: number;
}
