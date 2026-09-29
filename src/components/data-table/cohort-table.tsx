import type { CohortEntry } from "@/lib/db/analytics";
import { formatCompact } from "@/lib/format";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Games grouped by launch quarter (Task #27), newest first. */
export function CohortTable({
  cohorts,
  showDetail = false,
}: {
  cohorts: CohortEntry[];
  /** Adds the median and dead-count columns. */
  showDetail?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Launched</TableHead>
          <TableHead className="text-right">Games</TableHead>
          <TableHead className="text-right">Avg players</TableHead>
          {showDetail && <TableHead className="text-right">Median players</TableHead>}
          <TableHead className="text-right">Avg age</TableHead>
          {showDetail && <TableHead className="text-right">Dead</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {cohorts.map((c) => (
          <TableRow key={c.cohort}>
            <TableCell className="font-medium">{c.cohort}</TableCell>
            <TableCell className="text-right tabular-nums">{formatCompact(c.nGames)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCompact(Math.round(c.avgPlaying))}
            </TableCell>
            {showDetail && (
              <TableCell className="text-right tabular-nums">
                {formatCompact(Math.round(c.medianPlaying))}
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">
              {Math.round(c.avgAgeWeeks)} wk
            </TableCell>
            {showDetail && (
              <TableCell className="text-right tabular-nums">
                {formatCompact(c.deadCount)}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
