"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { badgeSnippets, type BadgeMetric } from "@/lib/badge";

import { Button } from "@/components/ui/button";

const METRICS: { value: BadgeMetric; label: string }[] = [
  { value: "players", label: "Players now" },
  { value: "rank", label: "Rank" },
];

/**
 * The game's live badge (Task #93) with copyable embed code. The snippets wrap
 * the image in a link, since an <img> can't carry one; `origin` is the site's
 * canonical URL so embeds never point at a preview deploy.
 */
export function BadgeEmbed({ universeId, origin }: { universeId: string; origin: string }) {
  const [metric, setMetric] = React.useState<BadgeMetric>("players");
  const [copied, setCopied] = React.useState<string | null>(null);
  const snippets = badgeSnippets(origin, universeId, metric);

  async function copy(kind: "html" | "markdown") {
    try {
      await navigator.clipboard.writeText(snippets[kind]);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy the embed code:", snippets[kind]);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label="Badge shows">
          {METRICS.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant={metric === m.value ? "secondary" : "ghost"}
              role="radio"
              aria-checked={metric === m.value}
              onClick={() => setMetric(m.value)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a live SVG, not an optimizable photo */}
        <img
          src={`/badge/${universeId}.svg${metric === "rank" ? "?metric=rank" : ""}`}
          alt=""
          height={20}
        />
      </div>
      <code className="block overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs whitespace-nowrap">
        {snippets.markdown}
      </code>
      <div className="flex flex-wrap gap-2">
        {(["markdown", "html"] as const).map((kind) => (
          <Button key={kind} type="button" variant="outline" size="sm" onClick={() => copy(kind)}>
            {copied === kind ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied === kind ? "Copied" : `Copy ${kind === "html" ? "HTML" : "Markdown"}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
