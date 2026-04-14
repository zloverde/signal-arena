#!/usr/bin/env ts-node
// ============================================================
// Signal Arena — Seed Script
// Creates demo agents, wallets, and sample rounds
// ============================================================
// Run: npx ts-node scripts/seed.ts
// Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
// ============================================================

import { createClient } from "@supabase/supabase-js";
import {
  sampleRegime,
  sampleTheta,
  generateRoundSignals,
  validateRound,
} from "../lib/engine/signal-engine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "sa_";
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function seedAgents() {
  console.log("Seeding agents...");

  const agentDefs = [
    { name: "SharpAlpha", reputation: 1150 },
    { name: "BayesBot", reputation: 1120 },
    { name: "MomentumMachine", reputation: 1080 },
    { name: "AverageAndrew", reputation: 1000 },
    { name: "OverconfidentOtto", reputation: 940 },
    { name: "RandomRoger", reputation: 900 },
    { name: "FundamentalFrank", reputation: 1040 },
    { name: "ContrarianCarla", reputation: 1010 },
  ];

  const createdAgents = [];

  for (const def of agentDefs) {
    const { data: agent, error } = await supabase
      .from("agents")
      .insert({
        name: def.name,
        api_key: generateApiKey(),
        reputation_score: def.reputation,
        total_rounds: Math.floor(Math.random() * 20),
        total_wins: Math.floor(Math.random() * 10),
      })
      .select()
      .single();

    if (error) {
      console.log(`  Skipping ${def.name}: ${error.message}`);
      continue;
    }

    // Create wallet
    await supabase.from("wallets").insert({
      agent_id: agent.id,
      balance: 800 + Math.random() * 400,
    });

    // Create leaderboard entry
    const totalProfit = (def.reputation - 1000) * 2.5;
    const totalStaked = 500 + Math.random() * 1000;
    await supabase.from("leaderboard_snapshots").upsert({
      agent_id: agent.id,
      agent_name: def.name,
      total_rounds: agent.total_rounds,
      total_staked: totalStaked,
      total_profit: totalProfit,
      roi: totalProfit / totalStaked,
      avg_score: 5 + Math.random() * 15,
      calibration_error: 0.05 + Math.random() * 0.15,
      reputation_score: def.reputation,
    });

    createdAgents.push(agent);
    console.log(`  Created agent: ${def.name} (${agent.id})`);
  }

  return createdAgents;
}

async function seedRounds() {
  console.log("\nSeeding rounds...");

  const roundTemplates = [
    {
      title: "Q4 Earnings Beat Probability",
      description: "Will the target company report earnings above analyst consensus estimates?",
      category: "market",
      opens_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      locks_at: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(), // 22 hours from now
      status: "open",
    },
    {
      title: "Fed Rate Decision: Hold or Cut?",
      description: "Will the Federal Reserve maintain or reduce the federal funds rate at next meeting?",
      category: "macro",
      opens_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      locks_at: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
      status: "open",
    },
    {
      title: "Sector Rotation Signal",
      description: "Will tech outperform financials over the next measured period?",
      category: "market",
      opens_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      locks_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      status: "open",
    },
    {
      title: "Volatility Regime Shift",
      description: "Will implied volatility index cross threshold level within the period?",
      category: "derivatives",
      opens_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      locks_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: "resolved",
    },
  ];

  const createdRounds = [];

  for (const [i, template] of roundTemplates.entries()) {
    const driftSeed = Math.floor(i / 5);
    const regime = sampleRegime();
    const theta = sampleTheta(regime);

    let valid = false;
    let generatedSignals: any;
    let attempts = 0;

    while (!valid && attempts < 5) {
      generatedSignals = generateRoundSignals("preview", theta, regime, driftSeed);
      const validation = validateRound(theta, generatedSignals.publicSignals);
      valid = validation.valid;
      attempts++;
    }

    if (!valid || !generatedSignals) {
      console.log(`  Skipping round "${template.title}" - could not generate valid signals`);
      continue;
    }

    const outcome = template.status === "resolved" ? (Math.random() > 0.5 ? 1 : 0) : null;

    const { data: round, error } = await supabase
      .from("rounds")
      .insert({
        title: template.title,
        description: template.description,
        category: template.category,
        status: template.status,
        regime,
        theta,
        outcome,
        entry_fee: 5,
        min_stake: 10,
        max_stake: 100,
        platform_fee_pct: 0.05,
        prize_pool: template.status === "resolved" ? 0 : 50 + Math.random() * 200,
        opens_at: template.opens_at,
        locks_at: template.locks_at,
        resolves_at: template.status === "resolved" ? new Date().toISOString() : null,
        source_drift_seed: driftSeed,
      })
      .select()
      .single();

    if (error) {
      console.log(`  Skipping "${template.title}": ${error.message}`);
      continue;
    }

    // Insert signals
    const allSignals = [
      ...generatedSignals.publicSignals,
      generatedSignals.purchasableSignal,
      ...generatedSignals.privateSignalPool.slice(0, 10),
    ].map((s: any) => ({ ...s, round_id: round.id }));

    await supabase.from("signals").insert(allSignals);

    // If resolved, add outcome record
    if (template.status === "resolved" && outcome !== null) {
      await supabase.from("outcomes").insert({
        round_id: round.id,
        realized_y: outcome,
        theta,
        regime,
      });
    }

    createdRounds.push(round);
    console.log(`  Created round: "${template.title}" [${template.status}] | Regime: ${regime} | Theta: ${theta.toFixed(3)}`);
  }

  return createdRounds;
}

async function main() {
  console.log("=".repeat(50));
  console.log("Signal Arena — Seed Script");
  console.log("=".repeat(50));

  try {
    const agents = await seedAgents();
    const rounds = await seedRounds();

    console.log("\n" + "=".repeat(50));
    console.log("Seed complete!");
    console.log(`  Agents created: ${agents.length}`);
    console.log(`  Rounds created: ${rounds.length}`);
    console.log("\nYou can now:");
    console.log("  - Visit http://localhost:3000 to see the dashboard");
    console.log("  - Use GET /api/rounds/open to see open rounds");
    console.log("  - Use POST /api/agents/register to create a real agent");
    console.log("=".repeat(50));
  } catch (err: any) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
}

main();
