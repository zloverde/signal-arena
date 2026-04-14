import Link from "next/link";

async function getOpenRounds() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/rounds/open`,
      { cache: "no-store" }
    );
    if (!res.ok) return { rounds: [] };
    return res.json();
  } catch {
    return { rounds: [] };
  }
}

export default async function RoundsPage() {
  const { rounds } = await getOpenRounds();

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light mb-1">Open Rounds</h1>
          <p className="text-xs font-mono text-arena-muted">
            {rounds.length} round{rounds.length !== 1 ? "s" : ""} accepting entries
          </p>
        </div>
        <div className="text-xs font-mono text-arena-muted live-indicator">
          LIVE
        </div>
      </div>

      {rounds.length === 0 ? (
        <div className="card text-center py-16">
          <div className="font-mono text-arena-muted text-sm mb-2">NO OPEN ROUNDS</div>
          <p className="text-xs text-arena-muted">Check back soon. New rounds open regularly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round: any) => (
            <Link key={round.id} href={`/rounds/${round.id}`}>
              <div className="card hover:border-arena-accent/40 transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="badge badge-open">{round.status}</span>
                      <span className="text-xs font-mono text-arena-muted">{round.category}</span>
                    </div>
                    <h2 className="text-sm text-arena-text group-hover:text-arena-accent transition-colors mb-1 truncate">
                      {round.title}
                    </h2>
                    <p className="text-xs text-arena-muted line-clamp-1">{round.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-arena-accent text-sm mb-1">
                      {round.prize_pool?.toFixed(0) ?? "0"} cr
                    </div>
                    <div className="text-xs text-arena-muted font-mono">prize pool</div>
                  </div>
                </div>
                <div className="flex items-center gap-6 mt-3 pt-3 border-t border-arena-border/50">
                  <div className="text-xs text-arena-muted">
                    <span className="font-mono text-arena-text">{round.entry_fee}cr</span> entry
                  </div>
                  <div className="text-xs text-arena-muted">
                    Stake <span className="font-mono text-arena-text">{round.min_stake}–{round.max_stake}cr</span>
                  </div>
                  <div className="text-xs text-arena-muted">
                    {round.signal_count?.public ?? 2} public · {round.signal_count?.private ?? 2} private · {round.signal_count?.purchasable ?? 1} purchasable
                  </div>
                  <div className="ml-auto text-xs font-mono text-arena-muted">
                    Locks: {new Date(round.locks_at).toLocaleString()}
                  </div>
                </div>

                {/* Public signals preview */}
                {round.public_signals?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {round.public_signals.slice(0, 2).map((sig: any) => (
                      <div key={sig.id} className="flex items-center gap-2 text-xs">
                        <span className={`signal-tag signal-${sig.source_family}`}>
                          {sig.source_family}
                        </span>
                        <span className="font-mono text-arena-text">
                          {(sig.raw_estimate * 100).toFixed(0)}%
                        </span>
                        <span className="text-arena-muted truncate max-w-xs">
                          {sig.message_text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 font-mono text-xs text-arena-muted border border-arena-border/50 rounded">
        <span className="text-arena-accent">API:</span>{" "}
        <code>GET /api/rounds/open</code> — returns all open rounds with public signals
      </div>
    </div>
  );
}
