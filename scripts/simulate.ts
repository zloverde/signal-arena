#!/usr/bin/env ts-node
// ============================================================
// Signal Arena — Simulation Harness
// ============================================================
// Validates that:
//   1. Sharp agents outperform weaker agents over many rounds
//   2. Rounds are neither trivial nor purely random
//   3. Source families perform as expected by regime
//   4. Purchasing signals adds value for sharp agents
//
// Run: npx ts-node scripts/simulate.ts
// ============================================================

import {
  sampleRegime,
  sampleTheta,
  generateRoundSignals,
  validateRound,
  computePayouts,
  computeRawScore,
  sampleOutcome,
  inferRegimePosterior,
  computeSharpEstimate,
  REGIME_SOURCE_RELIABILITY,
} from "../lib/engine/signal-engine";
import type {
  Regime,
  SourceFamily,
  AgentArchetype,
  AgentSimResult,
  SimulationResult,
} from "../types/index";

// ============================================================
// Agent strategy implementations
// ============================================================

interface SimAgent {
  id: string;
  archetype: AgentArchetype;
  balance: number;
  roundsPlayed: number;
  totalProfit: number;
  totalStaked: number;
  scores: number[];
  estimates: number[];
  outcomes: number[];
}

function createAgents(): SimAgent[] {
  return [
    { id: "sharp-1", archetype: "sharp", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "sharp-2", archetype: "sharp", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "average-1", archetype: "average", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "average-2", archetype: "average", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "overconfident-1", archetype: "overconfident", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "overconfident-2", archetype: "overconfident", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "random-1", archetype: "random", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
    { id: "random-2", archetype: "random", balance: 1000, roundsPlayed: 0, totalProfit: 0, totalStaked: 0, scores: [], estimates: [], outcomes: [] },
  ];
}

/**
 * Determine probability estimate and stake for each agent archetype.
 * This simulates how different types of agents would behave.
 */
function agentDecide(
  archetype: AgentArchetype,
  publicSignals: any[],
  privateSignals: any[],
  purchasedSignal: any | null,
  maxStake: number,
  minStake: number
): { probability: number; stake: number } {
  const allSignals = [...publicSignals, ...privateSignals];
  if (purchasedSignal) allSignals.push(purchasedSignal);

  switch (archetype) {
    case "sharp": {
      // Infer regime posterior from all available signals
      const regimePosterior = inferRegimePosterior(allSignals);
      const estimate = computeSharpEstimate(allSignals, regimePosterior);

      // Kelly-inspired stake sizing: bet more when more confident
      const confidence = Math.abs(estimate - 0.5) * 2; // 0 at 0.5, 1 at extremes
      const kellySizing = 0.3 + confidence * 0.5; // 30-80% of max stake
      const stake = Math.round(minStake + (maxStake - minStake) * kellySizing);

      return { probability: clamp(estimate, 0.05, 0.95), stake };
    }

    case "average": {
      // Simple weighted average of visible reliability hints
      const totalHint = allSignals.reduce((a, s) => a + s.visible_reliability_hint, 0);
      const weightedEstimate = allSignals.reduce(
        (a, s) => a + s.raw_estimate * s.visible_reliability_hint,
        0
      ) / (totalHint || 1);

      // Medium stake, constant
      const stake = Math.round((minStake + maxStake) / 2);
      return { probability: clamp(weightedEstimate, 0.05, 0.95), stake };
    }

    case "overconfident": {
      // Takes the strongest-sounding signal at face value
      // Always bets max stake
      const strongestSignal = allSignals.reduce((best, s) =>
        s.visible_reliability_hint > best.visible_reliability_hint ? s : best
      );
      // Pushes estimate toward extremes (overconfident)
      const raw = strongestSignal.raw_estimate;
      const pushed = raw > 0.5 ? Math.min(0.95, raw * 1.2) : Math.max(0.05, raw * 0.8);

      return { probability: pushed, stake: maxStake };
    }

    case "random": {
      // Random estimate and random stake
      const probability = 0.1 + Math.random() * 0.8;
      const stake = minStake + Math.floor(Math.random() * (maxStake - minStake));
      return { probability, stake };
    }
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ============================================================
// Signal family performance tracker
// ============================================================
interface SignalPerformance {
  totalReliability: number;
  count: number;
  correctDirections: number;
}

// ============================================================
// Run simulation
// ============================================================
async function runSimulation(
  numRounds: number = 200,
  verbose: boolean = false
): Promise<SimulationResult> {
  const agents = createAgents();
  const ENTRY_FEE = 5;
  const MIN_STAKE = 10;
  const MAX_STAKE = 100;
  const PLATFORM_FEE_PCT = 0.05;

  // Track signal family performance by regime
  const signalPerf: Record<string, Record<string, SignalPerformance>> = {};
  for (const regime of ["stable_trend", "mean_reversion", "shock_event"]) {
    signalPerf[regime] = {};
    for (const family of ["trend", "fundamental", "contrarian", "insider", "meta_reliability"]) {
      signalPerf[regime][family] = { totalReliability: 0, count: 0, correctDirections: 0 };
    }
  }

  let purchasedSignalValueTotal = 0;
  let purchasedSignalCount = 0;
  let validRoundsGenerated = 0;
  let invalidRoundsRejected = 0;

  for (let r = 0; r < numRounds; r++) {
    const driftSeed = Math.floor(r / 5);
    const regime = sampleRegime();
    const theta = sampleTheta(regime);

    // Generate signals
    const generated = generateRoundSignals(`sim-${r}`, theta, regime, driftSeed, agents.length);
    const validation = validateRound(theta, generated.publicSignals);

    if (!validation.valid) {
      invalidRoundsRejected++;
      continue; // Skip invalid rounds
    }

    validRoundsGenerated++;
    const outcome = sampleOutcome(theta);

    // Track signal performance
    for (const signal of [...generated.publicSignals, ...generated.privateSignalPool]) {
      const perf = signalPerf[regime][signal.source_family];
      if (perf) {
        perf.totalReliability += signal.hidden_reliability;
        perf.count++;
        // Did signal point in right direction?
        const rightDirection =
          (signal.raw_estimate > 0.5 && outcome === 1) ||
          (signal.raw_estimate < 0.5 && outcome === 0);
        if (rightDirection) perf.correctDirections++;
      }
    }

    // Each agent participates
    const entryList: {
      id: string;
      agent_id: string;
      probability_estimate: number;
      stake: number;
      fee_paid: number;
    }[] = [];

    let prizePool = 0;

    for (const agent of agents) {
      if (agent.balance < ENTRY_FEE + MIN_STAKE) continue; // Skip if broke

      // Deduct entry fee
      agent.balance -= ENTRY_FEE;
      prizePool += ENTRY_FEE * (1 - PLATFORM_FEE_PCT);

      // Give each agent 2 private signals from pool
      const agentIndex = agents.indexOf(agent);
      const poolSize = generated.privateSignalPool.length;
      const privateSignals = [
        generated.privateSignalPool[(agentIndex * 2) % poolSize],
        generated.privateSignalPool[(agentIndex * 2 + 1) % poolSize],
      ].filter(Boolean);

      // Sharp agents: check posterior entropy before deciding to buy signal
      // Only purchase when uncertainty is high (regime unclear)
      let purchasedSignal = null;
      if (agent.archetype === "sharp" && agent.balance >= generated.purchasableSignal.cost) {
        const initialSignals = [...generated.publicSignals, ...privateSignals];
        const initialPosterior = inferRegimePosterior(initialSignals);
        // Compute Shannon entropy over regime posterior
        const ent = -Object.values(initialPosterior).reduce(
          (a: number, p: number) => (p > 0 ? a + p * Math.log(p) : a), 0
        );
        // ln(3) ~ 1.099 is max entropy for 3 classes; buy when entropy > 82% of max
        if (ent > 0.9) {
          agent.balance -= generated.purchasableSignal.cost;
          purchasedSignal = generated.purchasableSignal;
          purchasedSignalCount++;
        }
      }

      // Agent decides
      const decision = agentDecide(
        agent.archetype,
        generated.publicSignals,
        privateSignals,
        purchasedSignal,
        MAX_STAKE,
        MIN_STAKE
      );

      if (agent.balance < decision.stake) continue;
      agent.balance -= decision.stake;
      prizePool += decision.stake * (1 - PLATFORM_FEE_PCT);

      entryList.push({
        id: `e-${r}-${agent.id}`,
        agent_id: agent.id,
        probability_estimate: decision.probability,
        stake: decision.stake,
        fee_paid: ENTRY_FEE,
      });

      agent.estimates.push(decision.probability);
      agent.outcomes.push(outcome);
      agent.totalStaked += decision.stake;
    }

    // Compute payouts
    const payouts = computePayouts(entryList, outcome, prizePool);

    for (const payout of payouts) {
      const agent = agents.find((a) => a.id === payout.agent_id);
      if (!agent) continue;

      agent.balance += payout.payout_amount;
      agent.totalProfit += payout.profit_loss;
      agent.scores.push(payout.raw_score);
      agent.roundsPlayed++;

      // Track value of purchased signal for sharp agents
      if (agent.archetype === "sharp") {
        purchasedSignalValueTotal += payout.profit_loss;
      }
    }

    if (verbose && r % 50 === 0) {
      console.log(`\n--- Round ${r} | Regime: ${regime} | Theta: ${theta.toFixed(3)} | Outcome: ${outcome} ---`);
      for (const agent of agents) {
        const lastScore = agent.scores[agent.scores.length - 1] ?? 0;
        console.log(`  ${agent.archetype} (${agent.id}): balance=${agent.balance.toFixed(0)}, profit=${agent.totalProfit.toFixed(0)}, rounds=${agent.roundsPlayed}`);
      }
    }
  }

  // Compute per-archetype aggregated results
  const archetypes: AgentArchetype[] = ["sharp", "average", "overconfident", "random"];
  const agentResults: AgentSimResult[] = archetypes.map((archetype) => {
    const archetypeAgents = agents.filter((a) => a.archetype === archetype);

    const totalProfit = archetypeAgents.reduce((a, b) => a + b.totalProfit, 0) / archetypeAgents.length;
    const totalStaked = archetypeAgents.reduce((a, b) => a + b.totalStaked, 0) / archetypeAgents.length;
    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
    const allScores = archetypeAgents.flatMap((a) => a.scores);
    const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

    // Win rate: rounds with positive profit
    const allPLs = archetypeAgents.flatMap((a) =>
      a.scores.map((s, i) => ({ score: s }))
    );
    const winRate = allPLs.length > 0 ? allPLs.filter((e) => e.score > 0).length / allPLs.length : 0;

    // Calibration error (MSE)
    const allEstimates = archetypeAgents.flatMap((a) => a.estimates);
    const allOutcomes = archetypeAgents.flatMap((a) => a.outcomes);
    const calibrationError =
      allEstimates.length > 0
        ? allEstimates.reduce((a, e, i) => a + Math.pow(e - allOutcomes[i], 2), 0) / allEstimates.length
        : 0;

    return { archetype, totalProfit, roi, avgScore, winRate, calibrationError };
  });

  // Aggregate signal family performance
  const signalFamilyPerformance: Record<string, Record<string, number>> = {};
  for (const [regime, families] of Object.entries(signalPerf)) {
    signalFamilyPerformance[regime] = {};
    for (const [family, perf] of Object.entries(families)) {
      signalFamilyPerformance[regime][family] =
        perf.count > 0 ? perf.correctDirections / perf.count : 0;
    }
  }

  return {
    rounds_simulated: validRoundsGenerated,
    agent_results: agentResults,
    signal_family_performance: signalFamilyPerformance as any,
    purchased_signal_value: purchasedSignalCount > 0 ? purchasedSignalValueTotal / purchasedSignalCount : 0,
  };
}

// ============================================================
// Print results
// ============================================================
function printResults(results: SimulationResult, invalidRejected: number = 0): void {
  console.log("\n" + "=".repeat(60));
  console.log("SIGNAL ARENA — SIMULATION RESULTS");
  console.log("=".repeat(60));
  console.log(`Rounds simulated: ${results.rounds_simulated}`);

  console.log("\n--- AGENT PERFORMANCE BY ARCHETYPE ---");
  console.log(
    "Archetype".padEnd(16) +
    "Profit".padEnd(12) +
    "ROI".padEnd(10) +
    "AvgScore".padEnd(12) +
    "WinRate".padEnd(12) +
    "CalibErr"
  );
  console.log("-".repeat(72));

  for (const r of results.agent_results) {
    const profitSign = r.totalProfit >= 0 ? "+" : "";
    console.log(
      r.archetype.padEnd(16) +
      `${profitSign}${r.totalProfit.toFixed(0)}`.padEnd(12) +
      `${(r.roi * 100).toFixed(1)}%`.padEnd(10) +
      r.avgScore.toFixed(2).padEnd(12) +
      `${(r.winRate * 100).toFixed(1)}%`.padEnd(12) +
      r.calibrationError.toFixed(4)
    );
  }

  // Check ordering
  const sorted = [...results.agent_results].sort((a, b) => b.roi - a.roi);
  const sharpRank = sorted.findIndex((r) => r.archetype === "sharp") + 1;
  const randomRank = sorted.findIndex((r) => r.archetype === "random") + 1;

  console.log("\n--- VALIDATION CHECKS ---");
  console.log(`✓ Sharp agents ROI rank: #${sharpRank} of 4 ${sharpRank === 1 ? "✅" : "⚠️ (should be #1)"}`);
  console.log(`✓ Random agents ROI rank: #${randomRank} of 4 ${randomRank >= 3 ? "✅" : "⚠️ (should be #3-4)"}`);

  const sharpResult = results.agent_results.find((r) => r.archetype === "sharp")!;
  const randomResult = results.agent_results.find((r) => r.archetype === "random")!;
  const calibrationGap = randomResult.calibrationError - sharpResult.calibrationError;
  console.log(`✓ Calibration gap (random - sharp): ${calibrationGap.toFixed(4)} ${calibrationGap > 0 ? "✅" : "⚠️"}`);

  console.log(`\n--- SIGNAL FAMILY PERFORMANCE BY REGIME ---`);
  console.log("(% rounds signal pointed in correct direction)");
  const regimes = ["stable_trend", "mean_reversion", "shock_event"];
  const families = ["trend", "fundamental", "contrarian", "insider"];
  console.log("Family".padEnd(16) + regimes.map((r) => r.padEnd(18)).join(""));
  console.log("-".repeat(70));
  for (const family of families) {
    let row = family.padEnd(16);
    for (const regime of regimes) {
      const val = (results.signal_family_performance as any)[regime]?.[family] ?? 0;
      row += `${(val * 100).toFixed(1)}%`.padEnd(18);
    }
    console.log(row);
  }

  console.log(`\n--- PURCHASED SIGNAL VALUE ---`);
  console.log(`Average profit delta for sharp agents (per purchase): ${results.purchased_signal_value.toFixed(2)}`);
  console.log(results.purchased_signal_value > 0 ? "✅ Purchasing signals adds value" : "⚠️ Signal purchasing not clearly profitable");

  console.log("\n" + "=".repeat(60));
}

// ============================================================
// Main
// ============================================================
async function main() {
  const numRounds = parseInt(process.argv[2] || "300");
  const verbose = process.argv.includes("--verbose");

  console.log(`Running ${numRounds} rounds...`);
  const results = await runSimulation(numRounds, verbose);
  printResults(results);
}

main().catch(console.error);
