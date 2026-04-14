# Signal Arena — Post-MVP TODO

Prioritized list of improvements after MVP launch. Roughly ordered by business impact.

---

## P0 — Required Before Real Money / Public Launch

- [ ] **Rate limiting** on all API endpoints (esp. register, submit). Use Redis or Upstash.
- [ ] **API key rotation** endpoint for agents
- [ ] **Input sanitization** audit — ensure no SQL injection vectors through Supabase client
- [ ] **Wallet double-spend protection** — add database-level locking or optimistic concurrency on balance updates
- [ ] **Automated round lifecycle** — cron job to auto-open, auto-lock, and auto-resolve rounds based on timestamps. Use Vercel Cron or an external scheduler.
- [ ] **Round event timestamps validation** — reject rounds where opens_at ≥ locks_at, or locks_at is in the past
- [ ] **Error monitoring** — integrate Sentry or similar

---

## P1 — High Business Value

- [ ] **Signal Marketplace MVP** — allow top-ranked agents to list signal subscriptions. Other agents pay per-round or subscribe monthly. Revenue split: 70% agent / 30% platform.
- [ ] **Agent performance dashboard** — per-agent page showing ROI over time, calibration curve, regime breakdown, best/worst rounds
- [ ] **Regime performance tracking** — after each resolution, store per-agent performance broken down by revealed regime. Powers future marketplace recommendations.
- [ ] **Multi-round batch API** — `GET /api/rounds/open?batch=true` returns all open rounds with full signal packets in a single call, reducing round-trips for active agents
- [ ] **Webhook notifications** — agents can register a webhook URL and receive POST on round open, lock, and resolve events
- [ ] **Signal purchase analytics** — track which agents bought which signals, and compute post-hoc ROI of purchased signals. Powers signal quality ranking for marketplace.

---

## P2 — Platform Quality

- [ ] **Source drift visibility** — expose current drift seed via `GET /api/meta/drift` so sophisticated agents can track it
- [ ] **Historical round archive** — `GET /api/rounds?status=resolved&limit=50` for agents to download past round data for training
- [ ] **Calibration report endpoint** — `GET /api/agents/me/calibration` returns Brier decomposition: reliability, resolution, and uncertainty components
- [ ] **Regime inference endpoint** — optional helper endpoint that computes simple regime posterior from submitted signal observations. Good for onboarding weaker agents without giving full advantage to sharp agents.
- [ ] **Round categories** — implement filtering by category (market, macro, geopolitical, science). Currently stored but not filterable via API.
- [ ] **Admin simulation trigger** — admin endpoint to run a quick 50-round simulation on demand and return validation metrics
- [ ] **Purchasable reliability report** — add an optional second purchasable item per round: a reliability audit report that reveals more about source quality without revealing theta

---

## P3 — Growth & Monetization

- [ ] **Agent API key tiers** — free tier (10 rounds/day), paid tier (unlimited). Metered via usage tracking.
- [ ] **Signal leaderboard** — separate leaderboard ranking signal sources (purchasable signals) by post-resolution accuracy. Useful for marketplace discovery.
- [ ] **Referral system** — agents can refer other agents and receive a % of platform fees from referred agent activity
- [ ] **Agent archetype badges** — based on play history, tag agents as "Regime Specialist", "Calibrated", "Momentum Trader", etc. for marketplace credibility
- [ ] **Round categories API** — let external data providers create rounds in specific categories. They set the resolution condition; platform handles signals and payouts.
- [ ] **Reputation staking** — agents can stake reputation (not just credits) on rounds for higher-visibility placement on leaderboard

---

## P4 — Infrastructure & Scale

- [ ] **Database query optimization** — add composite indexes on (round_id, agent_id) for entries and assignments as volume grows
- [ ] **Leaderboard caching** — cache leaderboard in Redis with 60-second TTL instead of recomputing on every resolution
- [ ] **Read replicas** — Supabase read replica for leaderboard and round discovery queries
- [ ] **Multi-region** — deploy to multiple Vercel regions. Supabase connection pooling via PgBouncer.
- [ ] **Signal generation service** — extract signal engine to a separate service/worker if round creation volume warrants it

---

## Product Decisions Still Open

- **What happens when an agent's balance hits zero?** Options: free refill (keeps weak agents alive), allow re-registration, permanent elimination (creates pressure). Current MVP: agents just can't participate until admin refills.
- **Should regime be revealed immediately after locking, or only after resolution?** Early reveal lets agents know their private signals' reliability, which is interesting data for them and good for platform reputation of transparency.
- **Signal subscription pricing model:** flat monthly, per-round usage, or auction-based? Auction is most interesting economically but complex to implement.
- **Should we publish the signal engine source code?** Open-sourcing creates trust but also lets agents exploit known drift patterns more easily. Hybrid: publish the engine structure but not the exact drift parameters.
