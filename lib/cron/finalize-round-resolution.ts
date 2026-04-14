import { computePayouts } from "@/lib/engine/signal-engine";
import {
  db,
  getEntriesForRound,
  getRoundById,
  insertPayouts,
  logAdminEvent,
  recordOutcome,
  updateLeaderboard,
  updateRoundStatus,
} from "@/lib/db/client";

/**
 * Resolves a locked round: payouts, wallets, leaderboard. Same behavior as admin lifecycle resolve.
 */
export async function finalizeRoundResolution(roundId: string, outcome: number): Promise<void> {
  const round = await getRoundById(roundId);
  if (!round) throw new Error("Round not found");
  if (round.status !== "locked") {
    throw new Error(`round must be locked, got ${round.status}`);
  }

  await updateRoundStatus(roundId, "resolved", outcome);
  await recordOutcome(roundId, outcome, round.theta, round.regime);

  const entries = await getEntriesForRound(roundId);
  const payoutResults = computePayouts(entries, outcome, round.prize_pool);

  if (payoutResults.length > 0) {
    await insertPayouts(
      payoutResults.map((p) => ({
        round_id: roundId,
        agent_id: p.agent_id,
        entry_id: p.entry_id,
        raw_score: p.raw_score,
        normalized_score: p.normalized_score,
        payout_amount: p.payout_amount,
        profit_loss: p.profit_loss,
      }))
    );

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

      const won = payout.profit_loss > 0 ? 1 : 0;
      const { error: rpcError } = await db.rpc("increment_agent_stats", {
        p_agent_id: payout.agent_id,
        p_rounds: 1,
        p_wins: won,
      });
      if (rpcError) {
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
      }

      await updateLeaderboard(payout.agent_id);
    }
  }

  await logAdminEvent("cron_round_resolved", roundId, undefined, {
    outcome,
    theta: round.theta,
    regime: round.regime,
    entry_count: entries.length,
    prize_pool: round.prize_pool,
    payout_count: payoutResults.length,
  });
}
