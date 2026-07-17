import { WatchlistView } from "./_components/watchlist-view";

export const metadata = { title: "Watchlist — rodict" };

export default function WatchlistPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-muted-foreground">
          Games and genres you&apos;re tracking — saved to this device only, no account needed.
        </p>
      </div>
      <WatchlistView />
    </div>
  );
}
