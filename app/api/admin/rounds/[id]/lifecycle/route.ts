// POST /api/admin/rounds/[id]/lifecycle
// Admin controls: open, lock, resolve round

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/auth";
import {
  getRoundById,
  updateRoundStatus,
  getEntriesForRound,
  insertPayouts,
  recordOutcome,
  updateLeaderboard,
  logAdminEvent,
  db,
} from "../../../../../lib/db/client";
import { computePayouts, sampleOutcome } from "../../../../../lib/engine/signal-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminError = requireAdmin(req);
  if (adminError) return adminError;

  const body = await req.json();
  const { action, force_outcome } = body;

  const round = await getRoundById(params.id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (action === "open") {
    if (round.status !== "draft") {
      return NextResponse.json(
        { error: `Cannot open round in status: ${round.status}` },
        { status: 400 }
      );
    }
    await updateRoundStatus(params.id, "open");
    await logAdminEvent("round_opened", params.id);
    return NextResponse.json({ message: "Round opened", status: "open" });
  }

  if (action === "lock") {
    if (round.status !== "open") {
      return NextResponse.json(
        { error: `Cannot lock round in status: ${round.status}` },
        { status: 400 }
      );
    }
    await updateRoundStatus(params.id, "locked");
    await logAdminEvent("round_locked", params.id);

    const entries = await getEntriesForRound(params.id);
    return NextResponse.json({
      message: "Round locked",
      status: "locked",
      entry_count: entries.length,
      prize_pool: round.prize_pool,
    });
  }

  if (action === "resolve") {
    if (round.status !== "locked") {
      return NextResponse.json(
        { error: `Cannot resolve round in status: ${round.status}` },
        { status: 400 }
      );
    }

    // Sample outcome from theta (or use forced outcome for testing)
    const outcome =
      force_outcome !== undefined
        ? Number(force_outcome)
        : sampleOutcome(round.theta);

    // Update round
    await updateRoundStatus(params.id, "resolved", outcome);

    // Record outcome
    await recordOutcome(params.id, outcome, round.theta, round.regime);

    // Get all entries
    const entries = await getEntriesForRound(params.id);

    // Compute payouts
    const payoutResults = computePayouts(entries, outcome, round.prize_pool);

    // Insert payouts and update wallets
    if (payoutResults.length > 0) {
      await insertPayouts(
        payoutResults.map((p) => ({
          round_id: params.id,
          agent_id: p.agent_id,
          entry_id: p.entry_id,
          raw_score: p.raw_score,
          normalized_score: p.normalized_score,
          payout_amount: p.payout_amount,
          profit_loss: p.profit_loss,
        }))
      );

      // Credit wallets and update stats
      for (const payout of payoutResults) {
        if (payout.payout_amount > 0) {
          const { data: wallet } = await db
            .from("wallets")
            .select("id")
            .eq("agent_id", payout.agent_id)
            .single();

          if (wallet) {
            const { data: w } = await db
              .from("wallets")
              .select("balance")
              .eq("id", wallet.id)
              .single();
            if (w) {
              await db
                .from("wallets")
                .update({ balance: w.balance + payout.payout_amount })
                .eq("id", wallet.id);
            }
          }
        }

        // Update agent stats
        const won = payout.profit_loss > 0 ? 1 : 0;
        await db.rpc("increment_agent_stats", {
          p_agent_id: payout.agent_id,
          p_rounds: 1,
          p_wins: won,
        }).catch(async () => {
          // Fallback if RPC not available
          const { data: agent } = await db
            .from("agents")
            .select("total_rounds, total_wins, reputation_score")
            .eq("id", payout.agent_id)
            .single();
          if (agent) {
            const reputationDelta = payout.profit_loss > 0 ? 10 : -5;
            await db
              .from("agents")
              .update({
                total_rounds: agent.total_rounds + 1,
                total_wins: agent.total_wins + won,
                reputation_score: Math.max(0, agent.reputation_score + reputationDelta),
              })
              .eq("id", payout.agent_id);
          }
        });

        await updateLeaderboard(payout.agent_id);
      }
    }

    await logAdminEvent("round_resolved", params.id, undefined, {
      outcome,
      theta: round.theta,
      regime: round.regime,
      entry_count: entries.length,
      prize_pool: round.prize_pool,
      payout_count: payoutResults.length,
    });

    return NextResponse.json({
      message: "Round resolved",
      outcome,
      theta: round.theta,
      regime: round.regime,
      prize_pool: round.prize_pool,
      payouts: payoutResults,
    });
  }

  if (action === "cancel") {
    await updateRoundStatus(params.id, "cancelled");
    await logAdminEvent("round_cancelled", params.id);
    return NextResponse.json({ message: "Round cancelled" });
  }

  return NextResponse.json(
    { error: "Unknown action. Valid: open, lock, resolve, cancel" },
    { status: 400 }
  );
}
