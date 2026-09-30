"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";

import { GLOSSARY, glossaryHref, type GlossaryKey } from "@/lib/glossary";
import { cn } from "@/lib/utils";

/**
 * A small "?" next to a derived stat (Task #112): its one-line definition and a
 * link to the /about entry. A popover rather than a tooltip, so it opens on tap
 * as well as hover and the link inside can be reached.
 */
export function MetricHelp({ term, className }: { term: GlossaryKey; className?: string }) {
  const entry = GLOSSARY[term];
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        aria-label={`What is ${entry.term}?`}
        className={cn(
          "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border text-[10px] leading-none font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        ?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} className="isolate z-50">
          <Popover.Popup className="max-w-xs origin-(--transform-origin) rounded-md border bg-popover px-3 py-2 text-left text-xs font-normal text-popover-foreground shadow-md transition-[opacity,transform] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="font-medium">{entry.term}</Popover.Title>
            <Popover.Description className="mt-0.5 text-muted-foreground">
              {entry.definition}
            </Popover.Description>
            <Link
              href={glossaryHref(term)}
              className="mt-1.5 inline-block underline underline-offset-2 hover:text-foreground"
            >
              How it&apos;s worked out
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A label followed by its "?", kept on one line (table headers, stat labels). */
export function LabelWithHelp({
  term,
  children,
}: {
  term: GlossaryKey;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <MetricHelp term={term} />
    </span>
  );
}
