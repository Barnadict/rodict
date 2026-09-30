import { PageHeader } from "@/components/page-header";
import { WatchlistView } from "./_components/watchlist-view";
import { CopyFeedUrl } from "./_components/copy-feed-url";

export const metadata = { title: "Watchlist — rodict" };

export default function WatchlistPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Watchlist"
        description="Games and genres you're tracking — saved to this device only, no account needed."
      />
      <CopyFeedUrl />
      <WatchlistView />
    </div>
  );
}
