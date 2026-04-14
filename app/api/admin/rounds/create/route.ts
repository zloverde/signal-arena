// POST /api/admin/rounds/create
// Admin creates a new round with auto-generated signals

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/auth";
import { createRound, insertSignals, logAdminEvent, db } from "../../../../lib/db/client";
import {
  sampleRegime,
  sampleTheta,
  generateRoundSignals,
  validateRound,
} from "../../../../lib/engine/signal-engine";
import type { Regime } from "../../../../types/index";

export async function POST(req: NextRequest) {
  const adminError = requireAdmin(req);
  if (adminError) return adminError;

  const body = await req.json();
  const {
    title,
    description,
    category = "general",
    opens_at,
    locks_at,
    entry_fee = 5,
    min_stake = 10,
    max_stake = 100,
    platform_fee_pct = 0.05,
    force_regime, // optional: override random regime for testing
    source_drift_seed, // optional: set drift seed explicitly
  } = body;

  if (!title || !description || !opens_at || !locks_at) {
    return NextResponse.json(
      { error: "Required: title, description, opens_at, locks_at" },
      { status: 400 }
    );
  }

  // Get current drift seed (increments every 5 resolved rounds)
  const { data: resolvedCount } = await db
    .from("rounds")
    .select("id", { count: "exact" })
    .eq("status", "resolved");
  const driftSeed = source_drift_seed ?? Math.floor(((resolvedCount as any)?.length ?? 0) / 5);

  // Sample regime and theta
  const regime: Regime = force_regime || sampleRegime();
  const theta = sampleTheta(regime);

  // Attempt to create a valid round (retry up to 3 times)
  let validationResult: any = null;
  let generatedSignals: any = null;
  let attempts = 0;

  while (attempts < 3) {
    generatedSignals = generateRoundSignals("preview", theta, regime, driftSeed);
    validationResult = validateRound(theta, generatedSignals.publicSignals);
    if (validationResult.valid) break;
    attempts++;
  }

  if (!validationResult.valid) {
    return NextResponse.json(
      {
        error: "Could not generate a valid round after 3 attempts",
        last_validation: validationResult,
      },
      { status: 422 }
    );
  }

  // Create round record
  const round = await createRound({
    title,
    description,
    category,
    opens_at,
    locks_at,
    entry_fee,
    min_stake,
    max_stake,
    platform_fee_pct,
    regime,
    theta,
    status: "draft",
    source_drift_seed: driftSeed,
  });

  // Insert all signals with real round_id
  const allSignals = [
    ...generatedSignals.publicSignals,
    generatedSignals.purchasableSignal,
    ...generatedSignals.privateSignalPool,
  ].map((s) => ({ ...s, round_id: round.id }));

  await insertSignals(allSignals);

  await logAdminEvent("round_created", round.id, undefined, {
    regime,
    theta,
    validation: validationResult,
    signal_count: allSignals.length,
  });

  return NextResponse.json({
    round,
    validation: validationResult,
    signal_preview: {
      public: generatedSignals.publicSignals.map((s: any) => ({
        source_family: s.source_family,
        raw_estimate: s.raw_estimate,
        hidden_reliability: s.hidden_reliability, // shown to admin only
        visible_reliability_hint: s.visible_reliability_hint,
        is_trap: s.is_trap,
        message_text: s.message_text,
      })),
      purchasable: {
        source_family: generatedSignals.purchasableSignal.source_family,
        hidden_reliability: generatedSignals.purchasableSignal.hidden_reliability,
        cost: generatedSignals.purchasableSignal.cost,
      },
      private_pool_size: generatedSignals.privateSignalPool.length,
    },
    hidden_info: { regime, theta },
  });
}
