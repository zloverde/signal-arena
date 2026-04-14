import type { Regime, SourceFamily } from "@/types/index";

// ---------------------------------------------------------------------------
// Regime × source base reliabilities (see docs/SIGNAL_ENGINE.md)
// ---------------------------------------------------------------------------

export const REGIME_SOURCE_RELIABILITY: Record<
  Regime,
  Record<SourceFamily, number>
> = {
  stable_trend: {
    trend: 0.82,
    fundamental: 0.6,
    contrarian: 0.25,
    insider: 0.55,
    meta_reliability: 0.7,
  },
  mean_reversion: {
    trend: 0.3,
    fundamental: 0.65,
    contrarian: 0.78,
    insider: 0.6,
    meta_reliability: 0.7,
  },
  shock_event: {
    trend: 0.2,
    fundamental: 0.72,
    contrarian: 0.45,
    insider: 0.85,
    meta_reliability: 0.65,
  },
};

const REGIME_PRIORS: Record<Regime, number> = {
  stable_trend: 0.45,
  mean_reversion: 0.35,
  shock_event: 0.2,
};

const FAMILY_HASH: Record<SourceFamily, number> = {
  trend: 1,
  fundamental: 2,
  contrarian: 3,
  insider: 4,
  meta_reliability: 5,
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function sampleRegime(): Regime {
  const u = Math.random();
  if (u < REGIME_PRIORS.stable_trend) return "stable_trend";
  if (u < REGIME_PRIORS.stable_trend + REGIME_PRIORS.mean_reversion) return "mean_reversion";
  return "shock_event";
}

export function sampleTheta(regime: Regime): number {
  if (regime === "stable_trend") {
    return clamp(0.55 + randn() * 0.18, 0.05, 0.95);
  }
  if (regime === "mean_reversion") {
    return clamp(0.5 + randn() * 0.12, 0.05, 0.95);
  }
  // shock_event: bimodal
  const branch = Math.random() < 0.5;
  const base = branch ? 0.75 : 0.25;
  return clamp(base + randn() * 0.12, 0.05, 0.95);
}

export function driftedReliability(
  regime: Regime,
  family: SourceFamily,
  driftSeed: number
): number {
  const base = REGIME_SOURCE_RELIABILITY[regime][family];
  const drift =
    Math.sin(driftSeed * 0.37 + FAMILY_HASH[family] * 0.13) * 0.08;
  return clamp(base + drift, 0.05, 0.95);
}

function effectiveReliability(
  drifted: number,
  isTrap: boolean
): number {
  const eff = isTrap ? clamp(1 - drifted, 0.05, 0.95) : drifted;
  return eff;
}

export type GeneratedSignalRow = {
  source_family: SourceFamily;
  visibility: "public" | "private" | "purchasable";
  raw_estimate: number;
  hidden_reliability: number;
  visible_reliability_hint: number;
  noise_level: number;
  cost: number;
  message_text: string;
  is_trap: boolean;
};

function buildSignal(params: {
  regime: Regime;
  theta: number;
  driftSeed: number;
  family: SourceFamily;
  visibility: GeneratedSignalRow["visibility"];
  isTrap: boolean;
  cost?: number;
  messageOverride?: string;
}): GeneratedSignalRow {
  const { regime, theta, driftSeed, family, visibility, isTrap } = params;
  const drifted = driftedReliability(regime, family, driftSeed);
  const hidden = effectiveReliability(drifted, isTrap);
  const noise_level = clamp(0.5 * (1 - hidden), 0.05, 0.4);
  const raw_estimate = clamp(
    theta * hidden + 0.5 * (1 - hidden) + randn() * noise_level,
    0.01,
    0.99
  );
  const visible_reliability_hint = clamp(drifted + randn() * 0.12, 0.1, 0.95);
  const message_text =
    params.messageOverride ??
    `[${family}] Model estimate ${(raw_estimate * 100).toFixed(1)}% (regime-conditional).`;

  return {
    source_family: family,
    visibility,
    raw_estimate,
    hidden_reliability: hidden,
    visible_reliability_hint,
    noise_level,
    cost: params.cost ?? 0,
    message_text,
    is_trap: isTrap,
  };
}

export function generateRoundSignals(
  _roundKey: string,
  theta: number,
  regime: Regime,
  driftSeed: number,
  numAgents?: number
): {
  publicSignals: GeneratedSignalRow[];
  purchasableSignal: GeneratedSignalRow;
  privateSignalPool: GeneratedSignalRow[];
} {
  // Public: trend, contrarian (trap), meta
  const trend = buildSignal({
    regime,
    theta,
    driftSeed,
    family: "trend",
    visibility: "public",
    isTrap: false,
    messageOverride: `[trend] Momentum model points to ${(theta * 100).toFixed(0)}% zone.`,
  });
  const contrarian = buildSignal({
    regime,
    theta,
    driftSeed,
    family: "contrarian",
    visibility: "public",
    isTrap: true,
    messageOverride: `[contrarian] Fade-trade setup — contrarian desk leans against trend.`,
  });

  const avgNoise =
    (trend.noise_level + contrarian.noise_level) / 2 ||
    0.15 + Math.random() * 0.1;
  const metaRaw = clamp(0.5 + (avgNoise - 0.225) * 0.35 + randn() * 0.04, 0.01, 0.99);
  const metaDrifted = driftedReliability(regime, "meta_reliability", driftSeed);
  const metaHidden = effectiveReliability(metaDrifted, false);
  const meta: GeneratedSignalRow = {
    source_family: "meta_reliability",
    visibility: "public",
    raw_estimate: metaRaw,
    hidden_reliability: metaHidden,
    visible_reliability_hint: clamp(metaDrifted + randn() * 0.12, 0.1, 0.95),
    noise_level: clamp(0.5 * (1 - metaHidden), 0.05, 0.4),
    cost: 0,
    message_text: `[meta] Cross-source dispersion elevated; confidence environment: ${(metaDrifted * 100).toFixed(0)}%.`,
    is_trap: false,
  };

  const publicSignals = [trend, contrarian, meta];

  // Private pool size
  const poolTarget = Math.max(20, ((numAgents ?? 1) * 3) | 0);
  const privateSignalPool: GeneratedSignalRow[] = [];
  const poolFamilies: SourceFamily[] = [
    "fundamental",
    "insider",
    "fundamental",
    "insider",
    "trend",
    "contrarian",
  ];
  for (let i = 0; i < poolTarget; i++) {
    const fam = poolFamilies[i % poolFamilies.length];
    const noisy = i % 5 === 4;
    privateSignalPool.push(
      buildSignal({
        regime,
        theta,
        driftSeed: driftSeed + i,
        family: fam,
        visibility: "private",
        isTrap: noisy && fam !== "insider",
        messageOverride: `[${fam}] Desk ${i} — conditional probability signal.`,
      })
    );
  }

  // Purchasable: insider in shock_event else fundamental; +8% reliability boost vs pool avg
  const purchFamily: SourceFamily = regime === "shock_event" ? "insider" : "fundamental";
  const poolAvgHidden =
    privateSignalPool.reduce((a, s) => a + s.hidden_reliability, 0) /
    Math.max(1, privateSignalPool.length);
  const boosted = clamp(poolAvgHidden + 0.08, 0.05, 0.95);
  const purchNoise = clamp(0.5 * (1 - boosted), 0.05, 0.35);
  const purchRaw = clamp(
    theta * boosted + 0.5 * (1 - boosted) + randn() * purchNoise,
    0.01,
    0.99
  );
  const purchasableSignal: GeneratedSignalRow = {
    source_family: purchFamily,
    visibility: "purchasable",
    raw_estimate: purchRaw,
    hidden_reliability: boosted,
    visible_reliability_hint: clamp(boosted + randn() * 0.08, 0.1, 0.95),
    noise_level: purchNoise,
    cost: 10,
    message_text: `[${purchFamily}] Premium flow / structural read — purchasable intelligence.`,
    is_trap: false,
  };

  return { publicSignals, purchasableSignal, privateSignalPool };
}

export function validateRound(
  _theta: number,
  publicSignals: Pick<
    GeneratedSignalRow,
    "raw_estimate" | "hidden_reliability" | "is_trap"
  >[]
): { valid: boolean; reasons?: string[] } {
  const reasons: string[] = [];
  const maxRel = Math.max(...publicSignals.map((s) => s.hidden_reliability), 0);
  if (maxRel > 0.92) reasons.push("max_public_reliability_too_high");

  const anyLearnable = publicSignals.some((s) => s.hidden_reliability >= 0.55);
  if (!anyLearnable) reasons.push("no_signal_reliable_enough");

  const estimates = publicSignals.map((s) => s.raw_estimate);
  const spread = Math.max(...estimates) - Math.min(...estimates);
  if (spread < 0.08) reasons.push("public_spread_too_low");

  const hasTrap = publicSignals.some((s) => s.is_trap);
  if (!hasTrap) reasons.push("no_trap_signal");

  return { valid: reasons.length === 0, reasons: reasons.length ? reasons : undefined };
}

export function sampleOutcome(theta: number): number {
  return Math.random() < theta ? 1 : 0;
}

export function computeRawScore(
  probability: number,
  outcome: number,
  stake: number
): number {
  const y = outcome;
  const p = probability;
  const brierComp = 1 - Math.pow(p - y, 2);
  return brierComp * (1 + Math.log1p(stake));
}

export function computePayouts(
  entries: Array<{
    id: string;
    agent_id: string;
    probability_estimate: number;
    stake: number;
    fee_paid: number;
  }>,
  outcome: number,
  prize_pool: number
): Array<{
  agent_id: string;
  entry_id: string;
  raw_score: number;
  normalized_score: number;
  payout_amount: number;
  profit_loss: number;
}> {
  if (entries.length === 0) return [];
  const y = outcome;
  const qualities = entries.map((e) => {
    const q = Math.max(0.0001, 1 - Math.pow(e.probability_estimate - y, 2)) * (1 + Math.log1p(e.stake));
    return q;
  });
  const sumQ = qualities.reduce((a, b) => a + b, 0);
  const pool = prize_pool;

  return entries.map((e, i) => {
    const normalized_score = sumQ > 0 ? qualities[i]! / sumQ : 1 / entries.length;
    const payout_amount = pool * normalized_score;
    const raw_score = payout_amount - e.stake;
    const profit_loss = payout_amount - e.stake;
    return {
      agent_id: e.agent_id,
      entry_id: e.id,
      raw_score,
      normalized_score,
      payout_amount,
      profit_loss,
    };
  });
}

export function inferRegimePosterior(
  observed: Pick<GeneratedSignalRow, "source_family" | "visible_reliability_hint">[]
): Record<Regime, number> {
  const regimes: Regime[] = ["stable_trend", "mean_reversion", "shock_event"];
  const logLik: Record<Regime, number> = {
    stable_trend: 0,
    mean_reversion: 0,
    shock_event: 0,
  };

  for (const regime of regimes) {
    let ll = Math.log(REGIME_PRIORS[regime]);
    for (const sig of observed) {
      const fam = sig.source_family as SourceFamily;
      const baseRel = REGIME_SOURCE_RELIABILITY[regime][fam] ?? 0.5;
      const matchScore = Math.max(0.01, 1 - Math.abs(sig.visible_reliability_hint - baseRel));
      ll += Math.log(matchScore);
    }
    logLik[regime] = ll;
  }

  const maxLL = Math.max(logLik.stable_trend, logLik.mean_reversion, logLik.shock_event);
  const expSum = regimes.reduce((a, r) => a + Math.exp(logLik[r] - maxLL), 0);
  const posterior: Record<Regime, number> = {
    stable_trend: Math.exp(logLik.stable_trend - maxLL) / expSum,
    mean_reversion: Math.exp(logLik.mean_reversion - maxLL) / expSum,
    shock_event: Math.exp(logLik.shock_event - maxLL) / expSum,
  };
  return posterior;
}

export function computeSharpEstimate(
  signals: Pick<
    GeneratedSignalRow,
    "source_family" | "raw_estimate" | "visible_reliability_hint"
  >[],
  regimePosterior: Record<Regime, number>
): number {
  let num = 0;
  let den = 0;
  for (const s of signals) {
    const fam = s.source_family as SourceFamily;
    let expectedRel = 0;
    for (const r of ["stable_trend", "mean_reversion", "shock_event"] as Regime[]) {
      expectedRel +=
        regimePosterior[r] * (REGIME_SOURCE_RELIABILITY[r][fam] ?? 0.5);
    }
    const w = Math.max(0.05, expectedRel * (0.5 + s.visible_reliability_hint));
    num += s.raw_estimate * w;
    den += w;
  }
  return den > 0 ? num / den : 0.5;
}
