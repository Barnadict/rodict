import { Download } from "lucide-react";

import { exportHref } from "@/lib/export";

/**
 * "Export CSV · JSON" for a table (Task #71). Plain download links to the
 * cached export route, carrying the table's current filters.
 */
export function ExportLinks({
  dataset,
  params,
  label = "Export",
}: {
  dataset: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const link = "rounded px-1 underline-offset-2 hover:text-foreground hover:underline";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Download aria-hidden="true" className="size-3.5" />
      {label}
      <a href={exportHref(dataset, "csv", params)} download className={link}>
        CSV
      </a>
      ·
      <a href={exportHref(dataset, "json", params)} download className={link}>
        JSON
      </a>
    </span>
  );
}
