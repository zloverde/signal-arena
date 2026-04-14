// GET /api/rounds/open
// Returns all open rounds with public signal previews

import { NextRequest, NextResponse } from "next/server";
import { getRounds, getPublicSignals } from "../../../lib/db/client";

export async function GET(req: NextRequest) {
  const rounds = await getRounds("open");

  // Attach public signals to each round
  const roundsWithSignals = await Promise.all(
    rounds.map(async (round) => {
      const publicSignals = await getPublicSignals(round.id);

      // Strip hidden fields from round (never expose regime/theta to agents)
      const { regime, theta, ...safeRound } = round;

      return {
        ...safeRound,
        public_signals: publicSignals.map(stripHidden),
        signal_count: {
          public: publicSignals.length,
          purchasable: 1, // agents can join to see purchasable options
          private: 2, // each agent gets 2 private signals on join
        },
      };
    })
  );

  return NextResponse.json({
    rounds: roundsWithSignals,
    count: roundsWithSignals.length,
  });
}

function stripHidden(signal: any) {
  const { hidden_reliability, is_trap, ...safe } = signal;
  return safe;
}
