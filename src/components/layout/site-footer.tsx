import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-6 text-sm text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          rodict is an unofficial, personal project. Not affiliated with
          Roblox Corporation. Earnings figures are estimates — see{" "}
          <Link href="/about" className="underline underline-offset-4">
            About the data
          </Link>
          .
        </p>
        <p>&copy; {new Date().getFullYear()} rodict</p>
      </div>
    </footer>
  );
}
