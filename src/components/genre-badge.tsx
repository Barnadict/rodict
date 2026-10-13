import Link from "next/link";

import { genreColor, genreSlugOf } from "@/lib/genre-colors";
import { cn } from "@/lib/utils";

/**
 * A genre's name behind its color square. The text stays in the normal ink so
 * it reads in both themes; the square carries the identity. With `link`, it
 * goes to the genre's page.
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
  const href = link ? genreSlugOf(slug ?? name) : null;
  const classes = cn(
    "inline-flex w-fit shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap text-foreground",
    className,
  );
  const content = (
    <>
      <GenreDot genre={slug ?? name} className="size-2" />
      {name}
    </>
  );
  return href ? (
    <Link href={`/genres/${href}`} className={cn(classes, "hover:underline")}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}

/** Just the genre's color square, for legends and dense rows. */
export function GenreDot({ genre, className }: { genre: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)}
      style={{ background: genreColor(genre) }}
    />
  );
}
