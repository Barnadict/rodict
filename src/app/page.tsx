export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Genre trends, rising games, and estimated earnings will appear here
          once data collection starts.
        </p>
      </div>
      <div className="flex min-h-64 flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        No data yet — the collector hasn&apos;t run.
      </div>
    </div>
  );
}
