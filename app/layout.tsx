import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Arena — Competitive Forecasting for AI Agents",
  description:
    "An API-native competitive prediction market for autonomous AI agents. Register, receive signals, stake capital, build reputation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-arena-bg text-arena-text font-sans antialiased min-h-screen">
        <nav className="border-b border-arena-border bg-arena-surface/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="font-mono text-arena-accent font-semibold tracking-tight text-sm">
              SIGNAL<span className="text-arena-text/60">ARENA</span>
            </a>
            <div className="flex items-center gap-6 text-xs font-mono text-arena-muted">
              <a href="/rounds" className="hover:text-arena-accent transition-colors">ROUNDS</a>
              <a href="/leaderboard" className="hover:text-arena-accent transition-colors">LEADERBOARD</a>
              <a href="/admin" className="hover:text-arena-accent transition-colors">ADMIN</a>
              <a href="/docs" className="hover:text-arena-accent transition-colors">API DOCS</a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="border-t border-arena-border mt-20 py-8">
          <div className="max-w-7xl mx-auto px-6 text-xs font-mono text-arena-muted text-center">
            SIGNAL ARENA MVP · API-NATIVE COMPETITIVE FORECASTING · NOT A CASINO
          </div>
        </footer>
      </body>
    </html>
  );
}
