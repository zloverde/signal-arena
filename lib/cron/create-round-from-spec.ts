import {
  createRound,
  db,
  insertSignals,
  logAdminEvent,
} from "@/lib/db/client";
import {
  generateRoundSignals,
  sampleRegime,
  sampleTheta,
  validateRound,
} from "@/lib/engine/signal-engine";
import type { Regime } from "@/types/index";
import { appendResolutionCriteria, normalizeResolutionCriteria } from "./resolution";

export type AnthropicRoundSpec = {
  title: string;
  description: string;
  category: string;
  hours_open: number;
  resolution_criteria: string;
};

const MIN_HOURS = 6;
const MAX_HOURS = 48;

async function nextDriftSeed(): Promise<number> {
  const { count } = await db
    .from("rounds")
    .select("*", { count: "exact", head: true })
    .eq("status", "resolved");
  return Math.floor((count ?? 0) / 5);
}

export async function createRoundFromAnthropicSpec(
  spec: AnthropicRoundSpec
): Promise<{ id: string }> {
  const normalized = normalizeResolutionCriteria(spec.resolution_criteria);
  if (!normalized) {
    throw new Error(`Invalid resolution_criteria: ${spec.resolution_criteria}`);
  }

  const hours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, Number(spec.hours_open) || 24));
  const now = Date.now();
  const opensAt = new Date(now).toISOString();
  const locksAt = new Date(now + hours * 60 * 60 * 1000).toISOString();

  const descriptionWithCriteria = appendResolutionCriteria(
    spec.description.trim(),
    normalized
  );

  const driftSeed = await nextDriftSeed();
  const regime: Regime = sampleRegime();
  const theta = sampleTheta(regime);

  let validationResult: { valid: boolean } | null = null;
  let generatedSignals: ReturnType<typeof generateRoundSignals> | null = null;
  let attempts = 0;

  while (attempts < 3) {
    generatedSignals = generateRoundSignals("cron", theta, regime, driftSeed);
    validationResult = validateRound(theta, generatedSignals.publicSignals);
    if (validationResult.valid) break;
    attempts++;
  }

  if (!generatedSignals || !validationResult?.valid) {
    throw new Error("Could not generate valid signals for cron round");
  }

  const round = await createRound({
    title: spec.title.trim(),
    description: descriptionWithCriteria,
    category: (spec.category || "market").trim() || "market",
    opens_at: opensAt,
    locks_at: locksAt,
    entry_fee: 5,
    min_stake: 10,
    max_stake: 100,
    platform_fee_pct: 0.05,
    regime,
    theta,
    status: "open",
    source_drift_seed: driftSeed,
  });

  const allSignals = [
    ...generatedSignals.publicSignals,
    generatedSignals.purchasableSignal,
    ...generatedSignals.privateSignalPool,
  ].map((s) => ({ ...s, round_id: round.id }));

  await insertSignals(allSignals);

  await logAdminEvent("cron_round_created", round.id, undefined, {
    regime,
    theta,
    resolution_criteria: normalized,
    hours_open: hours,
    signal_count: allSignals.length,
  });

  return { id: round.id };
}
