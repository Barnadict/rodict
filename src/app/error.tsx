"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Root error boundary (Task #36). Catches uncaught exceptions from any page
 * (a DB hiccup, a bad query param, etc.) so a visitor sees this instead of a
 * blank white screen. `unstable_retry` re-fetches/re-renders the segment
 * that crashed — Next 16.2's replacement for the old `reset()` prop, which
 * only cleared local error state without re-fetching.
 */
export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertTriangle className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        This page hit an unexpected error.{" "}
        {error.digest && (
          <span className="block text-xs">
            Reference: <span className="font-mono">{error.digest}</span>
          </span>
        )}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button type="button" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Button type="button" variant="outline" render={<Link href="/" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
