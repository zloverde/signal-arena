#!/usr/bin/env node
// ============================================================
// Signal Arena — Auto-Resolution Script
// ============================================================
// Fetches real market prices and resolves rounds automatically.
// Run this once daily (or set up a cron job).
//
// Usage:
//   node scripts/auto-resolve.js
//
// Requirements:
//   - VERCEL_URL: your Signal Arena URL
//   - ADMIN_SECRET_KEY: your admin key
//
// Set these in your terminal before running:
//   export VERCEL_URL=https://signal-arena-xxx.vercel.app
//   export ADMIN_SECRET_KEY=arena123
//
// Or create a file called resolve.env and run:
//   source resolve.env && node scripts/auto-resolve.js
// ============================================================

const VERCEL_URL = process.env.VERCEL_URL || "https://signal-arena-nj4ur5wyi-zloverdes-projects.vercel.app";
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || "arena123";

// ============================================================
// Price fetchers — all use free APIs, no key required
// ============================================================

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "SignalArena/1.0" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// Get current BTC price in USD from CoinGecko (free, no key)
async function getBTCPrice() {
  const data = await fetchJSON(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  );
  return data.bitcoin.usd;
}

// Get current ETH price in USD
async function getETHPrice() {
  const data = await fetchJSON(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
  );
  return data.ethereum.usd;
}

// Get S&P 500 current value from Yahoo Finance (free)
async function getSPYPrice() {
  const data = await fetchJSON(
    "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1d"
  );
  return data.chart.result[0].meta.regularMarketPrice;
}

// Get any crypto price by id (use CoinGecko coin id)
async function getCryptoPrice(coinId) {
  const data = await fetchJSON(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
  );
  return data[coinId]?.usd;
}

// ============================================================
// Round resolution logic
// ============================================================

// Parse a round title and determine the outcome based on real data.
// Returns: { outcome: 0 | 1, reason: string } or null if can't resolve
async function determineOutcome(round) {
  const title = round.title.toLowerCase();

  try {
    // BTC price rounds
    if (title.includes("btc") || title.includes("bitcoin")) {
      const price = await getBTCPrice();
      console.log(`  BTC price: $${price.toLocaleString()}`);

      const match = title.match(/\$([0-9,]+)k?/);
      if (match) {
        const threshold = parseFloat(match[1].replace(",", "")) * (title.includes("k") ? 1000 : 1);
        const outcome = price > threshold ? 1 : 0;
        return {
          outcome,
          reason: `BTC at $${price.toLocaleString()} vs threshold $${threshold.toLocaleString()} → ${outcome === 1 ? "YES" : "NO"}`
        };
      }
    }

    // ETH price rounds
    if (title.includes("eth") || title.includes("ethereum")) {
      const price = await getETHPrice();
      console.log(`  ETH price: $${price.toLocaleString()}`);

      const match = title.match(/\$([0-9,]+)k?/);
      if (match) {
        const threshold = parseFloat(match[1].replace(",", "")) * (title.includes("k") ? 1000 : 1);
        const outcome = price > threshold ? 1 : 0;
        return {
          outcome,
          reason: `ETH at $${price.toLocaleString()} vs threshold $${threshold.toLocaleString()} → ${outcome === 1 ? "YES" : "NO"}`
        };
      }
    }

    // S&P 500 / SPY rounds
    if (title.includes("s&p") || title.includes("spy") || title.includes("sp500")) {
      const price = await getSPYPrice();
      console.log(`  SPY price: $${price.toLocaleString()}`);

      const match = title.match(/\$([0-9,]+)/);
      if (match) {
        const threshold = parseFloat(match[1].replace(",", ""));
        const outcome = price > threshold ? 1 : 0;
        return {
          outcome,
          reason: `SPY at $${price.toLocaleString()} vs threshold $${threshold.toLocaleString()} → ${outcome === 1 ? "YES" : "NO"}`
        };
      }

      // "higher than monday" style — just use random for now, flag for manual
      return null;
    }

    // Can't auto-resolve
    return null;

  } catch (err) {
    console.log(`  Price fetch failed: ${err.message}`);
    return null;
  }
}

// ============================================================
// Signal Arena API calls
// ============================================================

async function getAllRounds() {
  const res = await fetch(`${VERCEL_URL}/api/admin/overview`, {
    headers: { "X-Admin-Key": ADMIN_KEY }
  });
  const data = await res.json();
  return data.recent_rounds || [];
}

async function lockRound(roundId) {
  const res = await fetch(`${VERCEL_URL}/api/admin/rounds/${roundId}/lifecycle`, {
    method: "POST",
    headers: { "X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "lock" })
  });
  return res.json();
}

async function resolveRound(roundId, outcome) {
  const res = await fetch(`${VERCEL_URL}/api/admin/rounds/${roundId}/lifecycle`, {
    method: "POST",
    headers: { "X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resolve", force_outcome: outcome })
  });
  return res.json();
}

async function openRound(roundId) {
  const res = await fetch(`${VERCEL_URL}/api/admin/rounds/${roundId}/lifecycle`, {
    method: "POST",
    headers: { "X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "open" })
  });
  return res.json();
}

// ============================================================
// Round templates — auto-created with real price thresholds
// ============================================================

async function createPriceRound(title, description, category, hoursOpen) {
  const opensAt = new Date().toISOString();
  const locksAt = new Date(Date.now() + hoursOpen * 60 * 60 * 1000).toISOString();

  const res = await fetch(`${VERCEL_URL}/api/admin/rounds/create`, {
    method: "POST",
    headers: { "X-Admin-Key": ADMIN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, category, opens_at: opensAt, locks_at: locksAt })
  });
  const data = await res.json();

  if (data.round) {
    // Immediately open it
    await openRound(data.round.id);
    return data.round;
  }
  return null;
}

// ============================================================
// Auto-create rounds based on current prices
// ============================================================

async function createDailyRounds() {
  console.log("\n📋 Creating today's price rounds...");

  try {
    const btc = await getBTCPrice();
    const eth = await getETHPrice();

    // Round BTC to nearest 5k for clean threshold
    const btcThreshold = Math.round(btc / 5000) * 5000;
    const ethThreshold = Math.round(eth / 500) * 500;

    const rounds = [
      {
        title: `Will BTC be above $${btcThreshold.toLocaleString()} at resolution?`,
        description: `Bitcoin price threshold round. Resolves based on CoinGecko spot price at lock time.`,
        category: "market",
        hoursOpen: 24
      },
      {
        title: `Will ETH be above $${ethThreshold.toLocaleString()} at resolution?`,
        description: `Ethereum price threshold round. Resolves based on CoinGecko spot price at lock time.`,
        category: "market",
        hoursOpen: 24
      },
      {
        title: `Will BTC be above $${(btcThreshold + 5000).toLocaleString()} at resolution?`,
        description: `Bitcoin upside round. Higher threshold than daily round.`,
        category: "market",
        hoursOpen: 48
      }
    ];

    for (const r of rounds) {
      const round = await createPriceRound(r.title, r.description, r.category, r.hoursOpen);
      if (round) {
        console.log(`  ✓ Created: "${r.title}"`);
      } else {
        console.log(`  ✗ Failed to create: "${r.title}"`);
      }
    }
  } catch (err) {
    console.log(`  Failed to create rounds: ${err.message}`);
  }
}

// ============================================================
// Main — runs daily
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const shouldCreate = args.includes("--create");
  const shouldResolve = args.includes("--resolve") || (!args.includes("--create"));

  console.log("=".repeat(55));
  console.log("SIGNAL ARENA — AUTO RESOLUTION");
  console.log(new Date().toLocaleString());
  console.log("=".repeat(55));
  console.log(`Platform: ${VERCEL_URL}`);

  // Optionally create today's rounds
  if (shouldCreate) {
    await createDailyRounds();
  }

  if (!shouldResolve) return;

  // Get all rounds
  console.log("\n🔍 Checking rounds for resolution...");
  const rounds = await getAllRounds();
  const now = new Date();

  let resolved = 0;
  let locked = 0;
  let skipped = 0;
  let manual = 0;

  for (const round of rounds) {
    const locksAt = new Date(round.locks_at);
    const isPastLockTime = now > locksAt;

    console.log(`\n[${round.status.toUpperCase()}] "${round.title}"`);
    console.log(`  Locks: ${locksAt.toLocaleString()} | Past lock: ${isPastLockTime}`);

    // Lock open rounds that are past their lock time
    if (round.status === "open" && isPastLockTime) {
      console.log("  → Locking round...");
      await lockRound(round.id);
      round.status = "locked";
      locked++;
    }

    // Resolve locked rounds
    if (round.status === "locked") {
      const result = await determineOutcome(round);

      if (result) {
        console.log(`  → ${result.reason}`);
        console.log(`  → Resolving with outcome: ${result.outcome}`);
        const res = await resolveRound(round.id, result.outcome);
        if (res.outcome !== undefined) {
          console.log(`  ✓ Resolved. Payouts: ${res.payouts?.length || 0} agents paid`);
          resolved++;
        } else {
          console.log(`  ✗ Resolution failed: ${res.error}`);
        }
      } else {
        console.log("  ⚠ Cannot auto-resolve — needs manual resolution in /admin");
        manual++;
      }
    }

    if (round.status === "resolved" || round.status === "draft") {
      skipped++;
    }
  }

  console.log("\n" + "=".repeat(55));
  console.log("SUMMARY");
  console.log(`  Locked:   ${locked}`);
  console.log(`  Resolved: ${resolved}`);
  console.log(`  Manual:   ${manual} (go to /admin to resolve these)`);
  console.log(`  Skipped:  ${skipped}`);
  console.log("=".repeat(55));
}

main().catch(console.error);
