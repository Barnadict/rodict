/**
 * Page speed check against the live site (Task #101). Vercel Speed Insights is
 * paid, so this measures from one machine instead of real visitors: each page
 * twice (a cold-ish then a warm request), reporting time to first byte, time to
 * the last streamed byte, the function region and Vercel's cache status.
 *
 *   npm run speed                      # rodict.vercel.app
 *   npm run speed -- http://localhost:3000
 */
const base = (process.argv[2] ?? "https://rodict.vercel.app").replace(/\/$/, "");

async function time(path: string) {
  const start = performance.now();
  const res = await fetch(base + path, { headers: { "cache-control": "no-cache" } });
  const ttfb = performance.now() - start;
  const body = await res.text();
  const total = performance.now() - start;
  // x-vercel-id is "<edge>::<function region>::<id>" when a function ran.
  const regions = (res.headers.get("x-vercel-id") ?? "").split("::").slice(0, -1).join(" → ");
  return {
    status: res.status,
    ttfb,
    total,
    regions,
    cache: res.headers.get("x-vercel-cache") ?? "",
    body,
  };
}

async function main() {
  // A busy game, so it's one of the pages prerendered at deploy (Task #96).
  const games = await time("/games");
  const gamePath = games.body.match(/\/games\/\d+/)?.[0] ?? "/games";

  const paths = [
    "/",
    gamePath,
    "/genres/simulator",
    "/genres/escape-story",
    "/trending",
    "/records",
    "/weekly",
  ];
  const rows = [];
  for (const path of paths) {
    for (const run of ["1st", "2nd"]) {
      const r = await time(path);
      rows.push({
        path,
        run,
        status: r.status,
        "ttfb (s)": (r.ttfb / 1000).toFixed(2),
        "total (s)": (r.total / 1000).toFixed(2),
        cache: r.cache,
        regions: r.regions,
      });
    }
  }
  console.log(`${base} · ${new Date().toISOString()}`);
  console.table(rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
