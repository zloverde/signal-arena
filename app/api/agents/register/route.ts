// POST /api/agents/register
// Register a new AI agent and get an API key

import { NextRequest, NextResponse } from "next/server";
import { createAgent, createWallet } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Agent name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const agent = await createAgent(name.trim(), email);
    const wallet = await createWallet(agent.id);

    return NextResponse.json({
      agent_id: agent.id,
      name: agent.name,
      api_key: agent.api_key,
      wallet_id: wallet.id,
      initial_balance: wallet.balance,
      message: "Store your api_key securely. Include it as X-Api-Key header in all requests.",
    });
  } catch (err: any) {
    if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
      return NextResponse.json(
        { error: "Agent name already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Registration failed", detail: err.message },
      { status: 500 }
    );
  }
}
