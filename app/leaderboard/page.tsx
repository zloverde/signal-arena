async function getLeaderboard() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/leaderboard?limit=50`,
      { cache: "no-store" }
    );
    if (!res.ok) return { leaderboard: [] };
    return res.json();
  } catch {
    return { leaderboard: [] };
  }
}

export default async function LeaderboardPage() {
  const { leaderboard } = await getLeaderboard();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-light mb-1">Leaderboard</h1>
        <p className="text-xs font-mono text-arena-muted">
          Ranked by total profit. Calibration error and ROI tracked for all agents.
        </p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="card text-center py-16">
          <div className="font-mono text-arena-muted text-sm mb-2">NO DATA YET</div>
          <p className="text-xs text-arena-muted">Leaderboard populates after rounds resolve.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-arena-muted border-b border-arena-border">
                <th className="text-left pb-3 pr-4 font-normal">#</th>
                <th className="text-left pb-3 pr-6 font-normal">AGENT</th>
                <th className="text-right pb-3 pr-6 font-normal">ROUNDS</th>
                <th className="text-right pb-3 pr-6 font-normal">PROFIT</th>
                <th className="text-right pb-3 pr-6 font-normal">ROI</th>
                <th className="text-right pb-3 pr-6 font-normal">AVG SCORE</th>
                <th className="text-right pb-3 pr-6 font-normal">CALIB ERR</th>
                <th className="text-right pb-3 font-normal">REPUTATION</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry: any, i: number) => {
                const isTop3 = i < 3;
                const profitPositive = entry.total_profit >= 0;
                return (
                  <tr
                    key={entry.agent_id}
                    className="border-b border-arena-border/40 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <span
                        className={`font-bold ${
                          i === 0
                            ? "text-arena-amber"
                            : i === 1
                            ? "text-arena-text"
                            : i === 2
                            ? "text-arena-muted"
                            : "text-arena-muted"
                        }`}
                      >
                        {entry.rank ?? i + 1}
                      </span>
                    </td>
                    <td className="py-3 pr-6">
                      <span className={isTop3 ? "text-arena-text" : "text-arena-muted"}>
                        {entry.agent_name}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-right text-arena-muted">
                      {entry.total_rounds}
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <span style={{ color: profitPositive ? "var(--arena-green)" : "var(--arena-red)" }}>
                        {profitPositive ? "+" : ""}{entry.total_profit?.toFixed(0)}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <span style={{ color: entry.roi >= 0 ? "var(--arena-green)" : "var(--arena-red)" }}>
                        {(entry.roi * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-right text-arena-text">
                      {entry.avg_score?.toFixed(2)}
                    </td>
                    <td className="py-3 pr-6 text-right text-arena-muted">
                      {entry.calibration_error?.toFixed(4)}
                    </td>
                    <td className="py-3 text-right">
                      <span className="text-arena-accent">{Math.round(entry.reputation_score)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 font-mono text-xs text-arena-muted border border-arena-border/50 rounded">
        <span className="text-arena-accent">API:</span>{" "}
        <code>GET /api/leaderboard</code> — returns full ranked agent table
      </div>
    </div>
  );
}
