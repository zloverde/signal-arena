"use client";

import { useState } from "react";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Round creation form
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    category: "market",
    opens_at: "",
    locks_at: "",
    entry_fee: 5,
    min_stake: 10,
    max_stake: 100,
  });

  async function fetchOverview(key: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/overview", {
        headers: { "X-Admin-Key": key },
      });
      if (res.status === 403) {
        setMessage("Invalid admin key");
        return;
      }
      const data = await res.json();
      setOverview(data);
      setAuthenticated(true);
    } catch (e) {
      setMessage("Failed to connect");
    } finally {
      setLoading(false);
    }
  }

  async function createRound() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/rounds/create", {
        method: "POST",
        headers: { "X-Admin-Key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`✓ Round created: ${data.round.id} | Regime: ${data.hidden_info.regime} | θ: ${data.hidden_info.theta.toFixed(3)}`);
        fetchOverview(adminKey);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function roundAction(roundId: string, action: string, forceOutcome?: number) {
    setLoading(true);
    setMessage("");
    try {
      const body: any = { action };
      if (forceOutcome !== undefined) body.force_outcome = forceOutcome;

      const res = await fetch(`/api/admin/rounds/${roundId}/lifecycle`, {
        method: "POST",
        headers: { "X-Admin-Key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessage(res.ok ? `✓ ${data.message}` : `Error: ${data.error}`);
      fetchOverview(adminKey);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-6 py-24">
        <h1 className="text-xl font-light mb-6 font-mono text-arena-accent">
          ADMIN ACCESS
        </h1>
        <div className="card space-y-4">
          <div>
            <label>Admin Secret Key</label>
            <input
              type="text"
              placeholder="Enter ADMIN_SECRET_KEY from .env"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchOverview(adminKey)}
            />
          </div>
          {message && (
            <div className="text-xs font-mono text-arena-red">{message}</div>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={() => fetchOverview(adminKey)}
            disabled={loading}
          >
            {loading ? "CONNECTING..." : "ACCESS ADMIN"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-light">Admin Dashboard</h1>
        <button className="btn btn-secondary text-xs" onClick={() => fetchOverview(adminKey)}>
          REFRESH
        </button>
      </div>

      {message && (
        <div className={`mb-4 p-3 font-mono text-xs border rounded ${message.startsWith("✓") ? "border-arena-green/30 text-arena-green" : "border-arena-red/30 text-arena-red"}`}>
          {message}
        </div>
      )}

      {/* Platform stats */}
      {overview?.platform && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            ["Total Agents", overview.platform.total_agents],
            ["Total Rounds", overview.platform.total_rounds],
            ["Open Rounds", overview.platform.rounds_by_status?.open ?? 0],
            ["Platform Balance", `${overview.platform.total_platform_balance?.toFixed(0)} cr`],
          ].map(([label, value]) => (
            <div key={label as string} className="card-sm">
              <div className="text-xs font-mono text-arena-muted mb-1">{label}</div>
              <div className="font-mono text-arena-accent text-lg">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Round */}
        <div className="card">
          <div className="section-header">Create Round</div>
          <div className="space-y-3">
            <div>
              <label>Title</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Will X happen?"
              />
            </div>
            <div>
              <label>Description</label>
              <input
                type="text"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Detailed description..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Category</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                >
                  <option value="market">market</option>
                  <option value="macro">macro</option>
                  <option value="geopolitical">geopolitical</option>
                  <option value="science">science</option>
                  <option value="general">general</option>
                </select>
              </div>
              <div>
                <label>Entry Fee (cr)</label>
                <input
                  type="number"
                  value={createForm.entry_fee}
                  onChange={(e) => setCreateForm({ ...createForm, entry_fee: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Opens At</label>
                <input
                  type="datetime-local"
                  value={createForm.opens_at}
                  onChange={(e) => setCreateForm({ ...createForm, opens_at: new Date(e.target.value).toISOString() })}
                />
              </div>
              <div>
                <label>Locks At</label>
                <input
                  type="datetime-local"
                  value={createForm.locks_at}
                  onChange={(e) => setCreateForm({ ...createForm, locks_at: new Date(e.target.value).toISOString() })}
                />
              </div>
            </div>
            <button
              className="btn btn-primary w-full"
              onClick={createRound}
              disabled={loading || !createForm.title || !createForm.opens_at}
            >
              {loading ? "CREATING..." : "CREATE ROUND"}
            </button>
            <p className="text-xs text-arena-muted">
              Regime and θ are auto-sampled. Signal engine validates before creation.
            </p>
          </div>
        </div>

        {/* Recent rounds with lifecycle controls */}
        <div className="card">
          <div className="section-header">Recent Rounds</div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {overview?.recent_rounds?.map((round: any) => (
              <div key={round.id} className="card-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge badge-${round.status}`}>{round.status}</span>
                      <span className="text-xs font-mono text-arena-muted">{round.regime}</span>
                    </div>
                    <div className="text-xs text-arena-text truncate">{round.title}</div>
                    <div className="text-xs text-arena-muted font-mono mt-0.5">
                      θ={round.theta?.toFixed(3)} · pool={round.prize_pool?.toFixed(0)}cr
                      {round.outcome !== null && round.outcome !== undefined && ` · outcome=${round.outcome}`}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {round.status === "draft" && (
                    <button
                      className="btn btn-secondary text-xs py-1"
                      onClick={() => roundAction(round.id, "open")}
                    >
                      OPEN
                    </button>
                  )}
                  {round.status === "open" && (
                    <button
                      className="btn btn-secondary text-xs py-1"
                      onClick={() => roundAction(round.id, "lock")}
                    >
                      LOCK
                    </button>
                  )}
                  {round.status === "locked" && (
                    <>
                      <button
                        className="btn btn-primary text-xs py-1"
                        onClick={() => roundAction(round.id, "resolve")}
                      >
                        RESOLVE
                      </button>
                      <button
                        className="btn btn-secondary text-xs py-1"
                        onClick={() => roundAction(round.id, "resolve", 1)}
                      >
                        RESOLVE→1
                      </button>
                      <button
                        className="btn btn-secondary text-xs py-1"
                        onClick={() => roundAction(round.id, "resolve", 0)}
                      >
                        RESOLVE→0
                      </button>
                    </>
                  )}
                  <a
                    href={`/api/admin/rounds/${round.id}/inspect`}
                    target="_blank"
                    className="btn btn-secondary text-xs py-1"
                  >
                    INSPECT
                  </a>
                </div>
              </div>
            ))}
            {(!overview?.recent_rounds || overview.recent_rounds.length === 0) && (
              <div className="text-xs text-arena-muted font-mono">No rounds yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Agent list */}
      {overview?.agents && (
        <div className="mt-8 card">
          <div className="section-header">Registered Agents</div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-arena-muted border-b border-arena-border">
                <th className="text-left pb-2 pr-4 font-normal">NAME</th>
                <th className="text-right pb-2 pr-4 font-normal">ROUNDS</th>
                <th className="text-right pb-2 pr-4 font-normal">REPUTATION</th>
                <th className="text-left pb-2 font-normal">JOINED</th>
              </tr>
            </thead>
            <tbody>
              {overview.agents.map((agent: any) => (
                <tr key={agent.id} className="border-b border-arena-border/30">
                  <td className="py-2 pr-4 text-arena-text">{agent.name}</td>
                  <td className="py-2 pr-4 text-right text-arena-muted">{agent.total_rounds}</td>
                  <td className="py-2 pr-4 text-right text-arena-accent">{Math.round(agent.reputation_score)}</td>
                  <td className="py-2 text-arena-muted">{new Date(agent.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent events */}
      {overview?.recent_events && overview.recent_events.length > 0 && (
        <div className="mt-8 card">
          <div className="section-header">Recent Admin Events</div>
          <div className="space-y-1">
            {overview.recent_events.map((event: any) => (
              <div key={event.id} className="flex gap-4 text-xs font-mono py-1 border-b border-arena-border/30">
                <span className="text-arena-muted">{new Date(event.created_at).toLocaleTimeString()}</span>
                <span className="text-arena-accent uppercase">{event.event_type}</span>
                <span className="text-arena-muted">{event.round_id?.split("-")[0]}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
