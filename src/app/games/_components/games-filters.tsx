"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCompact } from "@/lib/format";
import { AGE_OPTIONS, MIN_PLAYERS_OPTIONS, STATUS_OPTIONS } from "@/lib/games-list";

interface FilterOption {
  slug: string;
  name: string;
}

/** Sort choices for the picker; the grid has no column headers to click. */
const SORT_OPTIONS = [
  { value: "currentPlaying", label: "Most players" },
  { value: "currentVisits", label: "Most visits" },
  { value: "currentFavorites", label: "Most favorites" },
  { value: "allTimePeakPlayers", label: "Highest peak" },
  { value: "firstSeenAt", label: "Newest tracked" },
  { value: "likeRatio", label: "Best like ratio" },
  { value: "growth", label: "Fastest growing" },
  { value: "session", label: "Stickiest (Est.)" },
] as const;

const ALL = "all";

export function GamesFilters({
  genres,
  themes,
  hasRange,
}: {
  genres: FilterOption[];
  themes: FilterOption[];
  /** Growth is range-scoped, so its sort is only offered with a range. */
  hasRange: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");

  // Debounce the search box so every keystroke doesn't trigger a navigation.
  React.useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set("q", search);
      else params.delete("q");
      params.delete("page"); // a new search restarts pagination
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function onFilterChange(param: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL) params.delete(param);
    else params.set(param, value);
    // A picked sort starts from its natural direction (highest first).
    if (param === "sort") params.delete("order");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const sortOptions = SORT_OPTIONS.filter((o) => o.value !== "growth" || hasRange);
  const currentSort = searchParams.get("sort") ?? "currentPlaying";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search games..."
            aria-label="Search games"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterSelect
          label="Sort by"
          value={sortOptions.some((o) => o.value === currentSort) ? currentSort : "currentPlaying"}
          onChange={(v) => onFilterChange("sort", v === "currentPlaying" ? null : v)}
          options={sortOptions}
          className="sm:w-44"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Filter by genre"
          value={searchParams.get("genre") ?? ALL}
          onChange={(v) => onFilterChange("genre", v)}
          options={[
            { value: ALL, label: "All genres" },
            ...genres.map((g) => ({ value: g.slug, label: g.name })),
          ]}
          className="sm:w-44"
        />
        <FilterSelect
          label="Filter by theme"
          value={searchParams.get("theme") ?? ALL}
          onChange={(v) => onFilterChange("theme", v)}
          options={[
            { value: ALL, label: "All themes" },
            ...themes.map((t) => ({ value: t.slug, label: t.name })),
          ]}
          className="sm:w-40"
        />
        <FilterSelect
          label="Filter by status"
          value={searchParams.get("status") ?? ALL}
          onChange={(v) => onFilterChange("status", v)}
          options={[{ value: ALL, label: "Any status" }, ...STATUS_OPTIONS]}
          className="sm:w-36"
        />
        <FilterSelect
          label="Filter by age"
          value={searchParams.get("age") ?? ALL}
          onChange={(v) => onFilterChange("age", v)}
          options={[{ value: ALL, label: "Any age" }, ...AGE_OPTIONS]}
          className="sm:w-48"
        />
        <FilterSelect
          label="Filter by minimum players"
          value={searchParams.get("min") ?? ALL}
          onChange={(v) => onFilterChange("min", v)}
          options={[
            { value: ALL, label: "Any players" },
            ...MIN_PLAYERS_OPTIONS.map((n) => ({
              value: String(n),
              label: `≥${formatCompact(n)} playing`,
            })),
          ]}
          className="sm:w-40"
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as string | null)} items={options}>
      <SelectTrigger className={`w-full ${className ?? ""}`} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
