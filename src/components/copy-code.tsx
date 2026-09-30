"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/** A one-line code sample with a copy button (Task #115). */
export function CopyCode({ code, label = "Copy" }: { code: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. an insecure origin): show it to copy by hand.
      window.prompt("Copy:", code);
    }
  }

  return (
    <div className="flex items-stretch gap-2">
      <code className="block min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs whitespace-nowrap">
        {code}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={`${label}: ${code}`}
        className="shrink-0"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}
