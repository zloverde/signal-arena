import { NextRequest, NextResponse } from "next/server";
import { fetchRoundSpecsFromAnthropic } from "@/lib/cron/anthropic-rounds";
import { verifyCronAuth } from "@/lib/cron/cron-auth";
import { createRoundFromAnthropicSpec } from "@/lib/cron/create-round-from-spec";
import { fetchMarketPrices } from "@/lib/cron/market-prices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is required" },
      { status: 500 }
    );
  }

  try {
    const prices = await fetchMarketPrices();
    const dateStr = new Date().toDateString();
    const specs = await fetchRoundSpecsFromAnthropic(prices, dateStr);

    const created: string[] = [];
    const errors: { title?: string; message: string }[] = [];

    for (const spec of specs) {
      try {
        const { id } = await createRoundFromAnthropicSpec(spec);
        created.push(id);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ title: spec.title, message });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      created_round_ids: created,
      prices: {
        btc: prices.btc,
        eth: prices.eth,
        spy: prices.spy,
      },
      errors: errors.length ? errors : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
