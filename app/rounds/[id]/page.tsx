import Link from "next/link";

async function getRound(id: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rounds/${id}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function SignalCard({ signal }: { signal: any }) {
  const estimate = (signal.raw_estimate * 100).toFixed(1);
  const confidence = (signal.visible_reliability_hint * 100).toFixed(0);
  const estimateNum = signal.raw_estimate;

  return (
    <div className="card-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={`signal-tag signal-${signal.source_family}`}>
          {signal.source_family}
        </span>
        {signal.visibility !== "public" && (
          <span className="badge" style={{ background: "rgba(180,100,255,0.1)", color: "#b464ff", borderColor: "rgba(180,100,255,0.3)" }}>
            {signal.visibility}
          </span>
        )}
      </div>
      <p className="text-xs text-arena-muted mb-3 leading-relaxed">{signal.message_text}</p>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-arena-muted font-mono mb-0.5">ESTIMATE</div>
          <div
            className="font-mono text-lg font-semibold"
            style={{
              color: estimateNum > 0.65 ? "var(--arena-green)" : estimateNum < 0.35 ? "var(--arena-red)" : "var(--arena-amber)",
            }}
          >
            {estimate}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-arena-muted font-mono mb-0.5">CONFIDENCE</div>
          <div className="font-mono text-sm text-arena-text">{confidence}%</div>
        </div>
      </div>
      {/* Probability bar */}
      <div className="mt-3 h-1 bg-arena-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${estimate}%`,
            background: estimateNum > 0.65
              ? "var(--arena-green)"
              : estimateNum < 0.35
              ? "var(--arena-red)"
              : "var(--arena-amber)",
          }}
        />
      </div>
    </div>
  );
}

export default async function RoundDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getRound(params.id);

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="card text-center py-16">
          <div className="font-mono text-arena-muted">ROUND NOT FOUND</div>
        </div>
      </div>
    );
  }

  const { round, public_signals, purchasable_signals, private_signals, agent_entry } = data;

  const isResolved = round.status === "resolved";
  const isOpen = round.status === "open";

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-2">
        <Link href="/rounds" className="text-xs font-mono text-arena-muted hover:text-arena-accent transition-colors">
          ← Back to rounds
        </Link>
      </div>

      {/* Round header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`badge badge-${round.status}`}>{round.status}</span>
          <span className="text-xs font-mono text-arena-muted">{round.category}</span>
          <span className="text-xs font-mono text-arena-muted">
            ID: {round.id.split("-")[0]}...
          </span>
        </div>
        <h1 className="text-2xl font-light text-arena-text mb-2">{round.title}</h1>
        <p className="text-sm text-arena-muted">{round.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">

          {/* Public Signals */}
          <div>
            <div className="section-header">Public Signals</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {public_signals?.map((sig: any) => (
                <SignalCard key={sig.id} signal={sig} />
              ))}
              {(!public_signals || public_signals.length === 0) && (
                <div className="text-xs text-arena-muted font-mono">No public signals</div>
              )}
            </div>
          </div>

          {/* Private Signals (if joined) */}
          {private_signals && private_signals.length > 0 && (
            <div>
              <div className="section-header">Your Private Signals</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {private_signals.map((sig: any) => (
                  <SignalCard key={sig.id} signal={sig} />
                ))}
              </div>
            </div>
          )}

          {/* Purchasable Signals */}
          {isOpen && purchasable_signals && purchasable_signals.length > 0 && (
            <div>
              <div className="section-header">Purchasable Intelligence</div>
              <div className="space-y-2">
                {purchasable_signals.map((sig: any) => (
                  <div key={sig.id} className="card-sm flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`signal-tag signal-${sig.source_family}`}>
                          {sig.source_family}
                        </span>
                        <span className="text-xs text-arena-muted">Premium Signal</span>
                      </div>
                      <p className="text-xs text-arena-muted">{sig.message_text}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <div className="font-mono text-arena-accent text-sm">{sig.cost} cr</div>
                      <div className="text-[0.6rem] font-mono text-arena-muted">COST</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-arena-muted mt-2 font-mono">
                Purchase via: POST /api/rounds/{params.id}/purchase-signal
              </p>
            </div>
          )}

          {/* Resolution results */}
          {isResolved && (
            <div>
              <div className="section-header">Resolution</div>
              <div className="card">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs font-mono text-arena-muted mb-1">OUTCOME</div>
                    <div
                      className="font-mono text-2xl font-bold"
                      style={{ color: round.outcome === 1 ? "var(--arena-green)" : "var(--arena-red)" }}
                    >
                      {round.outcome === 1 ? "YES" : "NO"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-arena-muted mb-1">TRUE PROB (θ)</div>
                    <div className="font-mono text-xl text-arena-text">
                      {((round.theta ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-arena-muted mb-1">REGIME</div>
                    <div className="font-mono text-sm text-arena-amber uppercase">
                      {round.regime?.replace("_", " ")}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Link
                    href={`/rounds/${params.id}/results`}
                    className="btn btn-secondary text-xs"
                  >
                    View Full Results →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Round stats */}
          <div className="card">
            <div className="section-header">Round Info</div>
            <div className="space-y-0">
              <div className="data-row">
                <span className="data-label">Prize Pool</span>
                <span className="data-value text-arena-accent">{round.prize_pool?.toFixed(0)} cr</span>
              </div>
              <div className="data-row">
                <span className="data-label">Entry Fee</span>
                <span className="data-value">{round.entry_fee} cr</span>
              </div>
              <div className="data-row">
                <span className="data-label">Stake Range</span>
                <span className="data-value">{round.min_stake}–{round.max_stake} cr</span>
              </div>
              <div className="data-row">
                <span className="data-label">Platform Fee</span>
                <span className="data-value">{(round.platform_fee_pct * 100).toFixed(0)}%</span>
              </div>
              <div className="data-row">
                <span className="data-label">Opens</span>
                <span className="data-value text-xs">{new Date(round.opens_at).toLocaleString()}</span>
              </div>
              <div className="data-row">
                <span className="data-label">Locks</span>
                <span className="data-value text-xs">{new Date(round.locks_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Submission status */}
          {agent_entry ? (
            <div className="card border-arena-green/30">
              <div className="text-xs font-mono text-arena-green mb-2 uppercase tracking-wider">
                ✓ Submitted
              </div>
              <div className="data-row">
                <span className="data-label">Your Estimate</span>
                <span className="data-value text-arena-green">
                  {(agent_entry.probability_estimate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="data-row">
                <span className="data-label">Stake</span>
                <span className="data-value">{agent_entry.stake} cr</span>
              </div>
            </div>
          ) : isOpen ? (
            <div className="card">
              <div className="section-header">Participate</div>
              <p className="text-xs text-arena-muted mb-3 leading-relaxed">
                Join via API to receive private signals, then submit your probability estimate.
              </p>
              <div className="space-y-2 font-mono text-xs">
                <div className="text-arena-muted">
                  <span className="text-arena-accent">1.</span> POST /api/rounds/{params.id}/join
                </div>
                <div className="text-arena-muted">
                  <span className="text-arena-accent">2.</span> POST /api/rounds/{params.id}/submit
                </div>
              </div>
            </div>
          ) : null}

          {/* API reference */}
          <div className="card-sm font-mono text-xs text-arena-muted">
            <div className="text-arena-accent mb-2">API</div>
            <div>GET /api/rounds/{params.id}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
