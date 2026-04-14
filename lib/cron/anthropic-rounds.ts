import type { MarketPrices } from "./market-prices";
import type { AnthropicRoundSpec } from "./create-round-from-spec";

function parseJsonArrayFromText(text: string): unknown[] {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fence ? fence[1]!.trim() : trimmed;
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) throw new Error("Response must be a JSON array");
  return parsed;
}

function isSpec(x: unknown): x is AnthropicRoundSpec {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.description === "string" &&
    typeof o.category === "string" &&
    (typeof o.hours_open === "number" || typeof o.hours_open === "string") &&
    typeof o.resolution_criteria === "string"
  );
}

export async function fetchRoundSpecsFromAnthropic(
  prices: MarketPrices,
  dateStr: string
): Promise<AnthropicRoundSpec[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const btcPrice = prices.btc.toFixed(2);
  const ethPrice = prices.eth.toFixed(2);
  const spyPrice = prices.spy.toFixed(2);

  const prompt = `You are a prediction market designer for Signal Arena, a forecasting platform for AI agents.

Today's prices:
- BTC: $${btcPrice}
- ETH: $${ethPrice}  
- SPY: $${spyPrice}
- Date: ${dateStr}

Create exactly 4 interesting binary prediction rounds for today. Each round should:
- Be resolvable within 24-48 hours using public data
- Have a clear YES/NO outcome
- Include a price threshold OR a directional call (will X be higher/lower than Y)
- Vary in difficulty - some easy, some hard
- Occasionally include non-price rounds (e.g. will BTC volatility be above X, will ETH outperform BTC today)

Respond with a JSON array only, no other text:
[
  {
    "title": "Will BTC be above $87,000 at 9pm EST today?",
    "description": "Resolves based on CoinGecko spot price at lock time.",
    "category": "market",
    "hours_open": 12,
    "resolution_criteria": "btc_above_87000"
  }
]

resolution_criteria must be one of: btc_above_NUMBER, eth_above_NUMBER, spy_above_NUMBER, btc_outperforms_eth, eth_outperforms_btc`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = body.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic: empty response");

  const arr = parseJsonArrayFromText(text);
  if (arr.length !== 4) {
    throw new Error(`Expected exactly 4 rounds, got ${arr.length}`);
  }

  const specs: AnthropicRoundSpec[] = [];
  for (const item of arr) {
    if (!isSpec(item)) {
      throw new Error("Invalid round object in Anthropic response");
    }
    specs.push({
      title: item.title,
      description: item.description,
      category: item.category,
      hours_open:
        typeof item.hours_open === "number"
          ? item.hours_open
          : parseFloat(String(item.hours_open)),
      resolution_criteria: item.resolution_criteria,
    });
  }
  return specs;
}
