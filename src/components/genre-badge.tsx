import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { genreColor, genreSlugOf } from "@/lib/genre-colors";
import { cn } from "@/lib/utils";

/**
 * A genre chip with the genre's color as a dot (Task #106). The text stays in
 * the normal ink so it reads in both themes; the dot carries the identity.
 * With `link`, the chip goes to the genre's page.
 */
export function GenreBadge({
  name,
  slug,
  link = false,
  className,
}: {
  name: string;
  slug?: string | null;
  link?: boolean;
  className?: string;
}) {
  const color = genreColor(slug ?? name);
  const href = link ? genreSlugOf(slug ?? name) : null;
  const content = (
    <>
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      {name}
    </>
  );
  return (
    <Badge
      variant="secondary"
      className={cn("text-[10px]", className)}
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 35%, transparent)` }}
      render={href ? <Link href={`/genres/${href}`} /> : undefined}
    >
      {content}
    </Badge>
  );
}

/** Just the genre's color dot, for legends and dense rows. */
export function GenreDot({ genre, className }: { genre: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: genreColor(genre) }}
    />
  );
}
