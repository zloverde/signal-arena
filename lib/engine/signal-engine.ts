// ============================================================
// Signal Arena — Signal Engine
// ============================================================
// This is the core intelligence of the platform. It generates
// structured uncertainty: not random noise, not solved puzzles.
//
// Key invariants:
//   - Strong agents extract real edge by inferring regime
//   - Every round has at least 1 useful and 1 misleading signal
//   - Visible reliability hints are imperfect but informative
//   - Source reliability shifts across regimes (source drift)
// ============================================================

import {
  Regime,
  SourceFamily,
  SignalVisibility,
  Signal,
} from "../types/index";

// ============================================================
// Regime-aware source reliability matrices
//
// Each cell is the base reliability of source family given regime.
// 1.0 = perfect, 0.0 = random, negative = anti-correlated (trap)
// ============================================================
const REGIME_SOURCE_RELIABILITY: Record<Regime, Record<SourceFamily, number>> =
  {
    stable_trend: {
      trend: 0.82,
      fundamental: 0.60,
      contrarian: 0.25, // underperforms in trends
      insider: 0.55,
      meta_reliability: 0.70,
    },
    mean_reversion: {
      trend: 0.30, // overshoots in mean reversion
      fundamental: 0.65,
      contrarian: 0.78, // contrarians shine
      insider: 0.60,
      meta_reliability: 0.70,
    },
    shock_event: {
      trend: 0.20, // trend degrades in shocks
      fundamental: 0.72, // fundamentals more useful
      contrarian: 0.45,
      insider: 0.85, // insiders know most in shock events
      meta_reliability: 0.65,
    },
  };

// Regime prior probabilities (hidden from agents)
const REGIME_PRIORS: Record<Regime, number> = {
  stable_trend: 0.45,
  mean_reversion: 0.35,
  shock_event: 0.20,
};

// ============================================================
// Random utilities
// ============================================================

/** Box-Muller normal sample */
function randn(): number {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Clamp to [lo, hi] */
function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Noisy version of a value: add Gaussian noise scaled by noiseLevel */
function addNoise(value: number, noiseLevel: number): number {
  return clamp(value + randn() * noiseLevel, 0.01, 0.99);
}

/** Logistic transform to keep estimates in (0,1) */
function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ============================================================
// Sample regime from prior
// ============================================================
export function sampleRegime(): Regime {
  const r = Math.random();
  let cum = 0;
  for (const [regime, prob] of Object.entries(REGIME_PRIORS)) {
    cum += prob;
    if (r < cum) return regime as Regime;
  }
  return "stable_trend";
}

// ============================================================
// Sample theta (true probability) given regime
// Regimes have different characteristic theta distributions.
// ============================================================
export function sampleTheta(regime: Regime): number {
  // stable_trend: slightly skewed toward higher probabilities
  // mean_reversion: centered around 0.5
  // shock_event: bimodal, more extreme
  let base: number;

  if (regime === "stable_trend") {
    base = 0.55 + randn() * 0.18;
  } else if (regime === "mean_reversion") {
    base = 0.50 + randn() * 0.12;
  } else {
    // shock_event: bimodal
    base = Math.random() > 0.5 ? 0.75 + randn() * 0.12 : 0.25 + randn() * 0.12;
  }

  return clamp(base, 0.05, 0.95);
}

// ============================================================
// Apply source drift
// Source drift shifts reliabilities by a small amount every
// few rounds, preventing one static strategy from dominating.
// driftSeed should be updated by the platform every N rounds.
// ============================================================
function applySourceDrift(
  baseReliability: number,
  driftSeed: number,
  sourceFamily: SourceFamily
): number {
  // Use a deterministic but varying drift per source family
  const familyHash = sourceFamily
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const drift = Math.sin(driftSeed * 0.37 + familyHash * 0.13) * 0.08;
  return clamp(baseReliability + drift, 0.05, 0.95);
}

// ============================================================
// Generate a single signal
// ============================================================
function generateSignal(
  roundId: string,
  sourceFamily: SourceFamily,
  visibility: SignalVisibility,
  theta: number,
  regime: Regime,
  driftSeed: number,
  cost: number,
  isTrap: boolean,
  index: number
): Omit<Signal, "id"> {
  const baseReliability = REGIME_SOURCE_RELIABILITY[regime][sourceFamily];
  const driftedReliability = applySourceDrift(baseReliability, driftSeed, sourceFamily);

  // Trap signals have inverted reliability — they mislead
  const effectiveReliability = isTrap
    ? clamp(1 - driftedReliability, 0.05, 0.95)
    : driftedReliability;

  // noiseLevel inversely proportional to reliability
  const noiseLevel = clamp(0.5 * (1 - effectiveReliability), 0.05, 0.40);

  // raw_estimate: blend signal toward theta, with noise
  // High reliability → raw_estimate close to theta
  // Low reliability → raw_estimate is noisy
  const rawEstimate = addNoise(
    theta * effectiveReliability + 0.5 * (1 - effectiveReliability),
    noiseLevel
  );

  // visible_reliability_hint: noisy version of true reliability
  // Higher noise (0.20 std) means simple hint-weighting is unreliable.
  // Sharp agents who do proper Bayesian inference gain more advantage.
  const visibleReliabilityHint = clamp(
    driftedReliability + randn() * 0.20,
    0.1,
    0.95
  );

  const message = buildSignalMessage(
    sourceFamily,
    rawEstimate,
    visibleReliabilityHint,
    isTrap,
    index
  );

  return {
    round_id: roundId,
    source_family: sourceFamily,
    visibility,
    raw_estimate: rawEstimate,
    hidden_reliability: effectiveReliability,
    visible_reliability_hint: visibleReliabilityHint,
    noise_level: noiseLevel,
    cost,
    message_text: message,
    is_trap: isTrap,
  };
}

// ============================================================
// Build human-readable signal message
// These are intentionally terse and analytical in tone.
// ============================================================
function buildSignalMessage(
  family: SourceFamily,
  estimate: number,
  hint: number,
  isTrap: boolean,
  index: number
): string {
  const pct = Math.round(estimate * 100);
  const hintStr = Math.round(hint * 100);

  const prefixes: Record<SourceFamily, string[]> = {
    trend: [
      "Momentum analysis",
      "Trend composite",
      "Velocity model",
      "Directional signal",
    ],
    fundamental: [
      "Fundamental model",
      "Structural assessment",
      "Base-rate analysis",
      "Factor model output",
    ],
    contrarian: [
      "Sentiment reversal indicator",
      "Contrarian composite",
      "Crowding model",
      "Positioning signal",
    ],
    insider: [
      "Informed flow signal",
      "Order-book asymmetry",
      "Smart money tracker",
      "Dark pool indicator",
    ],
    meta_reliability: [
      "Source calibration report",
      "Cross-signal consistency check",
      "Reliability diagnostics",
      "Signal audit",
    ],
  };

  const prefix = prefixes[family][index % prefixes[family].length];

  if (family === "meta_reliability") {
    return `${prefix}: Cross-source agreement moderate. Reliability spread suggests ${hintStr < 55 ? "elevated" : "normal"} noise environment. Weighted consensus estimate: ${pct}%. Source confidence: ${hintStr}%.`;
  }

  return `${prefix} [${family.toUpperCase()}]: Probability estimate ${pct}%. Signal confidence: ${hintStr}%.${isTrap ? " [CONTRARIAN OVERRIDE]" : ""}`;
}

// ============================================================
// Main: Generate all signals for a round
// ============================================================
export interface GeneratedSignals {
  publicSignals: Omit<Signal, "id">[];
  purchasableSignal: Omit<Signal, "id">;
  privateSignalPool: Omit<Signal, "id">[]; // drawn from per agent
}

export function generateRoundSignals(
  roundId: string,
  theta: number,
  regime: Regime,
  driftSeed: number,
  numAgents: number = 10
): GeneratedSignals {
  const signals: Omit<Signal, "id">[] = [];

  // --- 2 public signals ---
  // Must include conflicting sources. One should be somewhat misleading.
  // In mean_reversion: trend is the trap (it overshoots), not contrarian.
  // In stable_trend/shock_event: contrarian is the trap.
  const trapFamily: SourceFamily =
    regime === "mean_reversion" ? "trend" : "contrarian";
  const usefulPublicFamily: SourceFamily =
    regime === "mean_reversion" ? "contrarian" : "trend";

  const publicFamilies: [SourceFamily, boolean][] = [
    [usefulPublicFamily, false],
    [trapFamily, true],
  ];

  for (const [i, [family, isTrap]] of publicFamilies.entries()) {
    signals.push(
      generateSignal(roundId, family, "public", theta, regime, driftSeed, 0, isTrap, i)
    );
  }

  // --- 1 public meta-reliability signal ---
  signals.push(
    generateSignal(roundId, "meta_reliability", "public", theta, regime, driftSeed, 0, false, 0)
  );

  // --- Private signal pool: 2 per agent ---
  // We generate a pool of N*2 signals, then distribute 2 per agent.
  // Each agent gets one "useful" and one "noisier" signal.
  const usefulFamilies: SourceFamily[] = ["fundamental", "insider"];
  const noisyFamilies: SourceFamily[] = ["trend", "contrarian", "fundamental"];

  const privatePool: Omit<Signal, "id">[] = [];

  for (let i = 0; i < Math.max(numAgents, 5); i++) {
    const usefulFamily = usefulFamilies[i % usefulFamilies.length];
    const noisyFamily = noisyFamilies[i % noisyFamilies.length];

    privatePool.push(
      generateSignal(roundId, usefulFamily, "private", theta, regime, driftSeed, 0, false, i)
    );
    privatePool.push(
      generateSignal(roundId, noisyFamily, "private", theta, regime, driftSeed, 0, Math.random() < 0.3, i)
    );
  }

  // --- 1 purchasable signal ---
  // Insider or fundamental, relatively high reliability, cost set low enough
  // that sharp agents have positive expected value from purchasing.
  const purchasableFamily: SourceFamily =
    regime === "shock_event" ? "insider" : "fundamental";
  const purchasable = generateSignal(
    roundId,
    purchasableFamily,
    "purchasable",
    theta,
    regime,
    driftSeed,
    5, // cost: 5 credits (reduced from 10 to ensure positive VoI)
    false,
    99
  );
  // Purchasable signals should be meaningfully better than average
  // Boost hidden reliability slightly
  const boostedPurchasable = {
    ...purchasable,
    hidden_reliability: clamp(purchasable.hidden_reliability + 0.08, 0.1, 0.97),
  };

  return {
    publicSignals: signals,
    purchasableSignal: boostedPurchasable,
    privateSignalPool: privatePool,
  };
}

// ============================================================
// Round Validator
// Ensures rounds are neither trivial nor random.
// ============================================================
export interface ValidationResult {
  valid: boolean;
  reasons: string[];
  metrics: {
    signal_spread: number; // spread of public estimates
    useful_signal_count: number;
    misleading_signal_count: number;
    max_public_reliability: number;
  };
}

export function validateRound(
  theta: number,
  publicSignals: Omit<Signal, "id">[]
): ValidationResult {
  const reasons: string[] = [];

  const estimates = publicSignals
    .filter((s) => s.source_family !== "meta_reliability")
    .map((s) => s.raw_estimate);

  const spread = Math.max(...estimates) - Math.min(...estimates);
  const maxReliability = Math.max(...publicSignals.map((s) => s.hidden_reliability));
  const usefulSignals = publicSignals.filter((s) => s.hidden_reliability >= 0.55).length;
  const misleadingSignals = publicSignals.filter(
    (s) => s.is_trap || s.hidden_reliability < 0.35
  ).length;

  // Reject trivial rounds (public signal reveals answer directly)
  if (maxReliability > 0.92) {
    reasons.push("Public signal reliability too high — round is trivial");
  }

  // Reject random rounds (all signals are low quality)
  if (usefulSignals === 0) {
    reasons.push("No useful signals — round is too random");
  }

  // Require some conflict — lowered from 0.08 to 0.05 to reduce false rejections
  // in mean_reversion regime where low-reliability signals cluster near 0.5
  if (spread < 0.05) {
    reasons.push("Signal spread too low — insufficient conflict between sources");
  }

  // Require at least 1 misleading signal
  if (misleadingSignals === 0) {
    reasons.push("No misleading signals — no traps for overconfident agents");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    metrics: {
      signal_spread: spread,
      useful_signal_count: usefulSignals,
      misleading_signal_count: misleadingSignals,
      max_public_reliability: maxReliability,
    },
  };
}

// ============================================================
// Sample outcome given theta
// ============================================================
export function sampleOutcome(theta: number): number {
  return Math.random() < theta ? 1 : 0;
}

// ============================================================
// Scoring and payouts
// ============================================================

/**
 * Compute raw score for an entry.
 * score = stake * (1 - (p - y)^2) * disciplineFactor
 *
 * disciplineFactor penalizes agents who always bet max stake
 * regardless of signal quality. For MVP, keep it simple.
 */
export function computeRawScore(
  p: number, // probability estimate [0.01, 0.99]
  y: number, // outcome 0 or 1
  stake: number,
  overallBetFrequency: number = 1.0 // fraction of rounds this agent bets max
): number {
  const brierComponent = 1 - Math.pow(p - y, 2);
  // Discipline factor: modestly penalize agents with freq > 0.8 max-betting
  const disciplineFactor =
    overallBetFrequency > 0.8 ? 0.95 - (overallBetFrequency - 0.8) * 0.25 : 1.0;
  return stake * brierComponent * disciplineFactor;
}

export interface PayoutResult {
  agent_id: string;
  entry_id: string;
  raw_score: number;
  normalized_score: number;
  payout_amount: number;
  profit_loss: number;
}

export function computePayouts(
  entries: { id: string; agent_id: string; probability_estimate: number; stake: number; fee_paid: number }[],
  outcome: number,
  prizePool: number
): PayoutResult[] {
  if (entries.length === 0) return [];

  // Compute raw scores
  const scored = entries.map((e) => ({
    ...e,
    raw_score: computeRawScore(e.probability_estimate, outcome, e.stake),
  }));

  // Only agents with positive raw score share the prize pool
  const positiveScored = scored.filter((s) => s.raw_score > 0);
  const totalPositiveScore = positiveScored.reduce((a, b) => a + b.raw_score, 0);

  return scored.map((s) => {
    const normalizedScore =
      totalPositiveScore > 0 && s.raw_score > 0
        ? s.raw_score / totalPositiveScore
        : 0;

    const payoutAmount = normalizedScore * prizePool;

    // profit_loss = payout - (stake + fee)
    const profitLoss = payoutAmount - s.stake - s.fee_paid;

    return {
      agent_id: s.agent_id,
      entry_id: s.id,
      raw_score: s.raw_score,
      normalized_score: normalizedScore,
      payout_amount: payoutAmount,
      profit_loss: profitLoss,
    };
  });
}

// ============================================================
// Regime inference helper (for agents / simulation)
// Given observed signals, return a posterior over regimes.
// This is what a sharp agent would compute.
// ============================================================
export function inferRegimePosterior(
  signals: { source_family: SourceFamily; raw_estimate: number; visible_reliability_hint: number }[]
): Record<Regime, number> {
  const regimes: Regime[] = ["stable_trend", "mean_reversion", "shock_event"];
  const logLikelihoods: Record<Regime, number> = {
    stable_trend: Math.log(REGIME_PRIORS.stable_trend),
    mean_reversion: Math.log(REGIME_PRIORS.mean_reversion),
    shock_event: Math.log(REGIME_PRIORS.shock_event),
  };

  for (const signal of signals) {
    for (const regime of regimes) {
      const baseRel = REGIME_SOURCE_RELIABILITY[regime][signal.source_family];
      // Signal reliability hint informs how well it matches the regime
      const matchScore = 1 - Math.abs(signal.visible_reliability_hint - baseRel);
      logLikelihoods[regime] += Math.log(Math.max(matchScore, 0.01));
    }
  }

  // Softmax over log likelihoods
  const maxLL = Math.max(...Object.values(logLikelihoods));
  const exps: Record<Regime, number> = {} as any;
  let sum = 0;
  for (const regime of regimes) {
    exps[regime] = Math.exp(logLikelihoods[regime] - maxLL);
    sum += exps[regime];
  }

  const posterior: Record<Regime, number> = {} as any;
  for (const regime of regimes) {
    posterior[regime] = exps[regime] / sum;
  }
  return posterior;
}

/**
 * Given regime posterior and signals, compute a Bayesian-weighted
 * probability estimate. This is the "sharp agent" strategy.
 */
export function computeSharpEstimate(
  signals: { source_family: SourceFamily; raw_estimate: number; visible_reliability_hint: number }[],
  regimePosterior: Record<Regime, number>
): number {
  const regimes: Regime[] = ["stable_trend", "mean_reversion", "shock_event"];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    // Expected reliability of this signal given regime posterior
    let expectedReliability = 0;
    for (const regime of regimes) {
      expectedReliability +=
        regimePosterior[regime] * REGIME_SOURCE_RELIABILITY[regime][signal.source_family];
    }

    // Weight by expected reliability
    weightedSum += expectedReliability * signal.raw_estimate;
    totalWeight += expectedReliability;
  }

  if (totalWeight === 0) return 0.5;
  return clamp(weightedSum / totalWeight, 0.01, 0.99);
}

export { REGIME_SOURCE_RELIABILITY, REGIME_PRIORS };
