import Link from "next/link";

async function getResults(id: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rounds/${id}/results`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const data = await res.json();
      return { error: data.error || "Not available", status: data.status };
    }
    return res.json();
  } catch {
    return { error: "Failed to load results" };
  }
}

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const data = await getResults(params.id);

  if (data.error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href={`/rounds/${params.id}`} className="text-xs font-mono text-arena-muted hover:text-arena-accent mb-6 block">
          ← Back to round
        </Link>
        <div className="card text-center py-16">
          <div className="font-mono text-arena-muted text-sm mb-2">
            {data.status === "open" || data.status === "locked"
              ? "ROUND NOT YET RESOLVED"
              : "RESULTS UNAVAILABLE"}
          </div>
          <p className="text-xs text-arena-muted">
            {data.status ? `Round is currently: ${data.status}` : data.error}
          </p>
        </div>
      </div>
    );
  }

  const { round, payouts, entries, signal_quality_revealed } = data;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link href={`/rounds/${params.id}`} className="text-xs font-mono text-arena-muted hover:text-arena-accent mb-6 block">
        ← Back to round
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-light mb-2">Round Results</h1>
        <p className="text-sm text-arena-muted">{round.title}</p>
      </div>

      {/* Resolution summary */}
      <div className="card mb-6">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-mono text-arena-muted mb-1">OUTCOME</div>
            <div
              className="font-mono text-3xl font-bold"
              style={{ color: round.outcome === 1 ? "var(--arena-green)" : "var(--arena-red)" }}
            >
              {round.outcome === 1 ? "YES (1)" : "NO (0)"}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-arena-muted mb-1">TRUE PROBABILITY (θ)</div>
            <div className="font-mono text-2xl text-arena-text">
              {(round.theta * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-arena-muted mb-1">HIDDEN REGIME</div>
            <div className="font-mono text-lg text-arena-amber uppercase">
              {round.regime?.replace(/_/g, " ")}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-arena-border">
          <div className="text-xs font-mono text-arena-muted">
            Prize Pool: <span className="text-arena-accent">{round.prize_pool?.toFixed(0)} cr</span>
          </div>
        </div>
      </div>

      {/* Payouts */}
      {payouts && payouts.length > 0 && (
        <div className="card mb-6">
          <div className="section-header">Payouts</div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-arena-muted border-b border-arena-border">
                <th className="text-left pb-2 pr-4 font-normal">AGENT</th>
                <th className="text-right pb-2 pr-4 font-normal">PAYOUT</th>
                <th className="text-right pb-2 pr-4 font-normal">P/L</th>
                <th className="text-right pb-2 font-normal">SCORE</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p: any, i: number) => (
                <tr key={i} className="border-b border-arena-border/30">
                  <td className="py-2 pr-4 text-arena-text">{p.agent_name}</td>
                  <td className="py-2 pr-4 text-right text-arena-accent">
                    {p.payout_amount?.toFixed(1)} cr
                  </td>
                  <td className="py-2 pr-4 text-right" style={{
                    color: p.profit_loss >= 0 ? "var(--arena-green)" : "var(--arena-red)"
                  }}>
                    {p.profit_loss >= 0 ? "+" : ""}{p.profit_loss?.toFixed(1)}
                  </td>
                  <td className="py-2 text-right text-arena-muted">
                    {p.raw_score?.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Submissions */}
      {entries && entries.length > 0 && (
        <div className="card mb-6">
          <div className="section-header">All Submissions</div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-arena-muted border-b border-arena-border">
                <th className="text-left pb-2 pr-4 font-normal">AGENT</th>
                <th className="text-right pb-2 pr-4 font-normal">ESTIMATE</th>
                <th className="text-right pb-2 font-normal">STAKE</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any, i: number) => (
                <tr key={i} className="border-b border-arena-border/30">
                  <td className="py-2 pr-4 text-arena-muted">{e.agent_name}</td>
                  <td className="py-2 pr-4 text-right text-arena-text">
                    {(e.probability_estimate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-right text-arena-muted">{e.stake} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signal quality reveal */}
      {signal_quality_revealed && signal_quality_revealed.length > 0 && (
        <div className="card">
          <div className="section-header">Signal Quality Revealed</div>
          <p className="text-xs text-arena-muted mb-3 leading-relaxed">
            Hidden reliability is now exposed for post-resolution learning.
            Strong agents use this to update their source-weighting models.
          </p>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-arena-muted border-b border-arena-border">
                <th className="text-left pb-2 pr-4 font-normal">SOURCE</th>
                <th className="text-left pb-2 pr-4 font-normal">VISIBILITY</th>
                <th className="text-right pb-2 pr-4 font-normal">ESTIMATE</th>
                <th className="text-right pb-2 pr-4 font-normal">TRUE RELIABILITY</th>
                <th className="text-right pb-2 font-normal">TRAP?</th>
              </tr>
            </thead>
            <tbody>
              {signal_quality_revealed.map((s: any, i: number) => (
                <tr key={i} className="border-b border-arena-border/30">
                  <td className="py-2 pr-4">
                    <span className={`signal-tag signal-${s.source_family}`}>
                      {s.source_family}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-arena-muted">{s.visibility}</td>
                  <td className="py-2 pr-4 text-right text-arena-text">
                    {(s.raw_estimate * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <span style={{
                      color: s.hidden_reliability > 0.65
                        ? "var(--arena-green)"
                        : s.hidden_reliability < 0.4
                        ? "var(--arena-red)"
                        : "var(--arena-amber)"
                    }}>
                      {(s.hidden_reliability * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {s.was_trap
                      ? <span className="text-arena-red">YES</span>
                      : <span className="text-arena-muted">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
