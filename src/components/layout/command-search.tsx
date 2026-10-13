"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Gamepad2, Layers, Search, Tag, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { searchIndex, type SearchIndex, type SearchKind } from "@/lib/search";

const KIND_ICON: Record<SearchKind, React.ComponentType<{ className?: string }>> = {
  game: Gamepad2,
  genre: Layers,
  theme: Tag,
  creator: User,
};

const KIND_LABEL: Record<SearchKind, string> = {
  game: "Games",
  genre: "Genres",
  theme: "Themes",
  creator: "Creators",
};

/** Fetched once per page load, on first open (or hover/focus of the trigger). */
let indexPromise: Promise<SearchIndex> | null = null;
function loadIndex(): Promise<SearchIndex> {
  indexPromise ??= fetch("/api/search-index")
    .then((res) => {
      if (!res.ok) throw new Error(`Search index ${res.status}`);
      return res.json() as Promise<SearchIndex>;
    })
    .catch((err) => {
      indexPromise = null; // let the next open retry
      throw err;
    });
  return indexPromise;
}

/**
 * Site-wide search (Task #70): the header's search box opens a palette over
 * games, genres, themes and creators; ⌘K / Ctrl+K opens it from anywhere.
 * Matching runs in the browser over a cached index (see src/lib/search.ts).
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState<SearchIndex | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const listId = React.useId();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const prefetch = React.useCallback(() => {
    loadIndex().then(setIndex, () => setFailed(true));
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFailed(false);
      prefetch();
    } else {
      setQuery("");
    }
  }

  React.useEffect(() => {
    if (open) prefetch();
  }, [open, prefetch]);

  const results = React.useMemo(() => (index ? searchIndex(index, query) : []), [index, query]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex].href);
    }
  }

  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        onPointerEnter={prefetch}
        onFocus={prefetch}
        className="flex h-9 w-full max-w-64 min-w-0 items-center gap-2 rounded-md bg-muted px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Find a game or genre</span>
        <kbd className="hidden shrink-0 font-sans text-xs sm:inline">Ctrl K</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-bar/60 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-[0_18px_48px_-12px_rgb(3_9_22/0.55)] transition duration-150 ease-out data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <div className="flex items-center gap-2.5 border-b-2 border-rule px-4">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={results.length ? optionId(activeIndex) : undefined}
              aria-autocomplete="list"
              aria-label="Search games, genres, themes and creators"
              placeholder="Game, genre, theme or creator"
              className="h-13 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div className="overflow-y-auto p-1.5">
            {query.trim() === "" ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Type a name. Arrow keys to move, Enter to open, Esc to close.
              </p>
            ) : failed && !index ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Search couldn&apos;t load. Close and try again.
              </p>
            ) : !index ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : results.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nothing matches &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label="Results">
                {results.map((r, i) => {
                  const Icon = KIND_ICON[r.kind];
                  const firstOfKind = i === 0 || results[i - 1].kind !== r.kind;
                  return (
                    <React.Fragment key={`${r.kind}:${r.href}`}>
                      {firstOfKind && (
                        <li
                          role="presentation"
                          className="px-2.5 pt-3 pb-1 text-sm text-muted-foreground font-display"
                        >
                          {KIND_LABEL[r.kind]}
                        </li>
                      )}
                      <li
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === activeIndex}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(r.href)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm",
                          i === activeIndex && "bg-accent text-accent-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{r.label}</span>
                        {r.detail && (
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {r.detail}
                          </span>
                        )}
                      </li>
                    </React.Fragment>
                  );
                })}
              </ul>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
