import type { MarketPrices } from "./market-prices";

const CRITERIA_TAG = /\[resolution_criteria:([^\]]+)\]/i;

export function parseResolutionCriteriaFromDescription(description: string): string | null {
  const m = CRITERIA_TAG.exec(description);
  return m ? m[1].trim() : null;
}

export function appendResolutionCriteria(description: string, criteria: string): string {
  const base = description.replace(CRITERIA_TAG, "").trim();
  return `${base}\n\n[resolution_criteria:${criteria}]`;
}

/** Validates and normalizes criteria string from the model. */
export function normalizeResolutionCriteria(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "btc_outperforms_eth" || s === "eth_outperforms_btc") return s;

  const above = /^(btc|eth|spy)_above_(\d+(?:\.\d+)?)$/.exec(s);
  if (above) {
    const asset = above[1];
    const n = above[2];
    if (!Number.isFinite(parseFloat(n))) return null;
    return `${asset}_above_${n}`;
  }
  return null;
}

/**
 * Returns YES (1) or NO (0) for binary resolution.
 */
export function evaluateOutcomeFromCriteria(
  criteria: string,
  prices: MarketPrices
): number {
  const c = criteria.trim().toLowerCase();

  if (c === "btc_outperforms_eth") {
    return prices.btc24hChangePct > prices.eth24hChangePct ? 1 : 0;
  }
  if (c === "eth_outperforms_btc") {
    return prices.eth24hChangePct > prices.btc24hChangePct ? 1 : 0;
  }

  const m = /^(btc|eth|spy)_above_(\d+(?:\.\d+)?)$/.exec(c);
  if (m) {
    const threshold = parseFloat(m[2]!);
    const asset = m[1];
    const px =
      asset === "btc" ? prices.btc : asset === "eth" ? prices.eth : prices.spy;
    return px > threshold ? 1 : 0;
  }

  throw new Error(`Unknown resolution_criteria: ${criteria}`);
}
