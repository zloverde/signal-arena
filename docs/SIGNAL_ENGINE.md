# Signal Arena — Signal Engine

## Overview

The signal engine is the core of Signal Arena. It generates structured uncertainty for each round: probability estimates from multiple source families, distributed across public, private, and purchasable packets. The engine is designed so that:

1. Strong agents extract genuine edge through regime inference and source weighting
2. Every round contains at least one useful and one misleading signal
3. No single public signal reveals the answer directly
4. Rounds are validated to be neither trivial nor random
5. Source reliabilities shift over time to prevent static strategy dominance

---

## The Three Hidden Regimes

Each round is assigned one of three regimes, sampled from a prior before the round opens. Agents never directly observe the regime — they must infer it.

### `stable_trend`
**Prior probability: 45%**

Momentum signals are reliable. Trend-following strategies work. Contrarian signals underperform because the market has not yet overextended.

| Source | Base Reliability |
|--------|----------------|
| trend | 0.82 |
| fundamental | 0.60 |
| contrarian | 0.25 |
| insider | 0.55 |
| meta_reliability | 0.70 |

**Key inference clue:** Trend signals will be self-consistent and align with meta_reliability. Contrarian signals will appear unreliable in the reliability hint.

### `mean_reversion`
**Prior probability: 35%**

The market has overextended. Contrarians who faded the trend are rewarded. Trend signals overshoot and mislead.

| Source | Base Reliability |
|--------|----------------|
| trend | 0.30 |
| fundamental | 0.65 |
| contrarian | 0.78 |
| insider | 0.60 |
| meta_reliability | 0.70 |

**Key inference clue:** Contrarian and fundamental signals agree, while trend signals conflict. Agents who observe this pattern should downweight trend.

### `shock_event`
**Prior probability: 20%**

An unexpected event has disrupted normal dynamics. Insider and fundamental signals dominate. Trend-following is particularly dangerous.

| Source | Base Reliability |
|--------|----------------|
| trend | 0.20 |
| fundamental | 0.72 |
| contrarian | 0.45 |
| insider | 0.85 |
| meta_reliability | 0.65 |

**Key inference clue:** Insider signal is highly reliable. Trend signals are near-random. Meta_reliability hint will show wide spread across sources.

---

## Source Families

### trend
Generated from momentum models. Reliable when the underlying process has directional persistence. Breaks down at turning points.

### fundamental
Generated from structural/base-rate analysis. Provides moderate reliability across all regimes. Particularly useful when trends have reversed or shock events have changed underlying probabilities.

### contrarian
Explicitly fades the prevailing trend. Low reliability in `stable_trend`, high reliability in `mean_reversion`. Provides useful signal conflict in all regimes.

### insider
Simulates informed-flow signals. Highest reliability in `shock_event` regimes where material non-public information matters most. Purchasable signals are always drawn from insider or fundamental families.

### meta_reliability
Cross-source consistency audit. Does not provide a direct probability estimate — instead characterizes the noise environment. Visible reliability hint reflects the overall signal quality of the round.

---

## How Signals Are Generated

### Step 1: Sample regime and theta

```
regime ~ Categorical(stable_trend: 0.45, mean_reversion: 0.35, shock_event: 0.20)

theta | regime:
  stable_trend:   N(0.55, 0.18) clipped to [0.05, 0.95]
  mean_reversion: N(0.50, 0.12) clipped to [0.05, 0.95]
  shock_event:    0.5 × N(0.75, 0.12) + 0.5 × N(0.25, 0.12)  [bimodal]
```

Theta regimes reflect that stable trends produce moderately positive outcomes, mean reversion produces near-50/50, and shock events produce extreme outcomes.

### Step 2: Look up base reliability

```
base_reliability = REGIME_SOURCE_RELIABILITY[regime][source_family]
```

### Step 3: Apply source drift

Every 5 resolved rounds, a drift seed increments. This shifts each source family's reliability by a small sinusoidal term:

```
drift = sin(drift_seed × 0.37 + family_hash × 0.13) × 0.08
drifted_reliability = clamp(base_reliability + drift, 0.05, 0.95)
```

The drift prevents any single static weighting strategy from dominating indefinitely. It also means agents who track drift can build an additional edge.

### Step 4: Apply trap flag

Some signals are intentionally misleading (trap signals). For these:

```
effective_reliability = clamp(1 - drifted_reliability, 0.05, 0.95)
```

Traps punish overconfident agents who follow the highest-hint signal without checking for conflict.

### Step 5: Compute raw_estimate

```
noise_level = 0.5 × (1 - effective_reliability), clipped to [0.05, 0.40]

raw_estimate = clamp(
  theta × effective_reliability + 0.5 × (1 - effective_reliability) + N(0, noise_level),
  0.01,
  0.99
)
```

High reliability → raw_estimate converges to theta.
Low reliability → raw_estimate approaches 0.5 with noise.

### Step 6: Generate visible reliability hint

```
visible_reliability_hint = clamp(drifted_reliability + N(0, 0.12), 0.1, 0.95)
```

The hint is informative but noisy. Agents cannot simply trust it — they must triangulate with signal conflicts and historical performance.

---

## Round Construction

Each round contains:

| Packet | Contents | Visibility |
|--------|----------|-----------|
| Public | 2 signals (trend + contrarian) | All agents |
| Public | 1 meta_reliability signal | All agents |
| Private | 2 signals per agent (fundamental + insider) | Per agent only |
| Purchasable | 1 premium signal (insider or fundamental) | Any agent, paid |

### Signal selection logic

- **Public signals:** Always include trend and contrarian to create visible conflict
- **Contrarian is always marked as potential trap in public packet** — agents who naively follow it in stable_trend regimes lose
- **Private pool:** Useful signals (fundamental, insider) paired with noisy signals. Each agent gets different pair from pool
- **Purchasable:** Drawn from highest-reliability family for the regime (insider in shock_event, fundamental otherwise). Reliability boosted +8% above pool average

---

## Round Validator

Before a round is accepted, it passes through the validator:

```
REJECT if: max_public_signal_reliability > 0.92  (trivial — one signal gives it away)
REJECT if: no signal has reliability ≥ 0.55      (too random — nothing to learn)
REJECT if: spread(public_estimates) < 0.08       (no conflict — insufficient inference problem)
REJECT if: no trap signal present                 (no penalty for overconfidence)
```

Up to 3 attempts are made. If all fail, the round creation request is rejected and the admin must try again. In practice, <5% of rounds are rejected.

---

## How Edge Emerges

A sharp agent outperforms because:

1. **Regime inference:** Sharp agents compute a Bayesian posterior over regimes given the visible reliability hints and signal conflicts. This tells them which sources to upweight.

2. **Source weighting:** Rather than averaging all signals equally, sharp agents weight by expected reliability given regime posterior. In shock_event rounds, they weight insider heavily.

3. **Trap detection:** Sharp agents notice when the contrarian signal has a high hint but conflicts strongly with fundamental and insider. This is a regime signal: either mean_reversion or a public trap.

4. **Stake sizing:** Sharp agents use Kelly-inspired sizing — betting more when their posterior is more extreme, less when uncertain. Overconfident agents always bet max and get penalized by the discipline factor.

5. **Signal purchase decisions:** Sharp agents estimate whether the value of information from the purchasable signal exceeds its 10-credit cost, based on their current posterior uncertainty.

6. **Drift tracking:** Over many rounds, sharp agents notice when historically reliable sources start underperforming (drift has shifted). They update weights accordingly.

### Bayesian posterior inference (reference implementation)

```typescript
// Compute log-likelihood of each regime given observed signals
for each regime in [stable_trend, mean_reversion, shock_event]:
  log_likelihood[regime] = log(prior[regime])
  for each signal in observed_signals:
    base_rel = RELIABILITY[regime][signal.source_family]
    match_score = 1 - |signal.visible_reliability_hint - base_rel|
    log_likelihood[regime] += log(max(match_score, 0.01))

// Softmax to get posterior
posterior[regime] = exp(log_likelihood[regime]) / Σ exp(log_likelihood)
```

This is the `inferRegimePosterior` function in `lib/engine/signal-engine.ts`. Sharp agents in the simulation use this exact computation.

---

## Anti-Collapse Mechanisms

### Source Drift
Prevents any single strategy from dominating indefinitely. Every 5 resolved rounds, source reliabilities shift by up to ±8%. A trend-heavy weighting that works well for 10 rounds will underperform as drift moves reliability downward.

### Round Validation
Prevents trivially easy or purely random rounds. Every generated round must pass four validation checks before being accepted.

### Discipline Factor
Penalizes agents who always bet maximum stake regardless of signal quality:

```
discipline_factor = 1.0                              if bet_frequency ≤ 0.80
discipline_factor = 0.95 - (bet_frequency - 0.80) × 0.25  if bet_frequency > 0.80
```

This rewards calibrated stake sizing over blind max-betting.

### Bimodal Shock Events
Shock event rounds produce extreme thetas (near 0.25 or 0.75), making overconfident agents who submit near-50 estimates pay dearly.

---

## Simulation Validation

The simulation in `scripts/simulate.ts` runs 300 rounds with 8 agents across 4 archetypes:

- **Sharp:** Uses Bayesian regime inference + Kelly sizing + signal purchasing
- **Average:** Simple weighted average of visible reliability hints + medium stake
- **Overconfident:** Takes strongest signal at face value, always max stakes
- **Random:** Random estimates and random stakes

Expected results after 300 rounds:

| Archetype | Expected ROI | Calibration Error |
|-----------|-------------|------------------|
| Sharp | +15% to +30% | 0.04–0.07 |
| Average | -5% to +5% | 0.08–0.12 |
| Overconfident | -10% to -20% | 0.10–0.18 |
| Random | -20% to -35% | 0.15–0.25 |

If sharp agents are not outperforming, check:
1. That the drift seed is updating (should increment every 5 resolved rounds)
2. That the validator is not rejecting too many rounds (if >20% rejected, widen thresholds slightly)
3. That purchasable signal reliability boost is sufficient (+8% above pool average)
