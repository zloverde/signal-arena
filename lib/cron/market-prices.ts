/**
 * Live market data for cron resolution and Anthropic prompts.
 */

export type MarketPrices = {
  btc: number;
  eth: number;
  spy: number;
  btc24hChangePct: number;
  eth24hChangePct: number;
};

type CoinGeckoSimple = {
  bitcoin?: { usd?: number; usd_24h_change?: number };
  ethereum?: { usd?: number; usd_24h_change?: number };
};

async function fetchCrypto(): Promise<{
  btc: number;
  eth: number;
  btc24hChangePct: number;
  eth24hChangePct: number;
}> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
    { next: { revalidate: 60 } }
  );
  if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);
  const j = (await res.json()) as CoinGeckoSimple;
  const btc = j.bitcoin?.usd;
  const eth = j.ethereum?.usd;
  if (typeof btc !== "number" || typeof eth !== "number") {
    throw new Error("CoinGecko: missing BTC/ETH prices");
  }
  return {
    btc,
    eth,
    btc24hChangePct: typeof j.bitcoin?.usd_24h_change === "number" ? j.bitcoin.usd_24h_change : 0,
    eth24hChangePct: typeof j.ethereum?.usd_24h_change === "number" ? j.ethereum.usd_24h_change : 0,
  };
}

async function fetchSpyYahoo(): Promise<number> {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1d",
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalArena/1.0)" },
      next: { revalidate: 60 },
    }
  );
  if (!res.ok) throw new Error(`Yahoo SPY failed: ${res.status}`);
  const j = (await res.json()) as {
    chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
  };
  const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price)) {
    throw new Error("Yahoo: invalid SPY price");
  }
  return price;
}

async function fetchSpyStooq(): Promise<number> {
  const res = await fetch("https://stooq.com/q/l/?s=spy.us&f=sd2l1", { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Stooq SPY failed: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/).filter((l) => l.toLowerCase().includes("spy.us"));
  const line = lines[0] ?? text.trim().split(/\r?\n/).filter(Boolean)[1] ?? text.trim().split(/\r?\n/).filter(Boolean)[0];
  if (!line) throw new Error("Stooq: empty SPY response");
  const parts = line.split(/[;,]/).map((p) => p.trim());
  const nums = parts.map((p) => parseFloat(p)).filter((n) => Number.isFinite(n));
  const last = nums[nums.length - 1];
  if (typeof last !== "number" || !Number.isFinite(last)) {
    throw new Error("Stooq: could not parse SPY price");
  }
  return last;
}

export async function fetchMarketPrices(): Promise<MarketPrices> {
  const crypto = await fetchCrypto();
  let spy: number;
  try {
    spy = await fetchSpyYahoo();
  } catch {
    spy = await fetchSpyStooq();
  }
  return {
    ...crypto,
    spy,
  };
}
