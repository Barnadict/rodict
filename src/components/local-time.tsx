"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

interface LocalTimeProps {
  /** A Date, an ISO timestamp, or epoch ms. */
  value: Date | string | number;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}

/**
 * A timestamp in the visitor's own timezone (Task #54). Timestamps are stored in
 * UTC and shown in local time only in the UI, but `toLocaleString()` in a server
 * component formats in the SERVER's timezone (UTC on Vercel). So the server
 * renders the time explicitly labeled UTC, and the browser swaps in local time
 * after hydration. useSyncExternalStore's server snapshot keeps the first client
 * render identical to the server HTML, so there's no hydration mismatch.
 */
export function LocalTime({ value, options = DEFAULT_OPTIONS, className }: LocalTimeProps) {
  const isClient = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const text = isClient
    ? date.toLocaleString(undefined, options)
    : `${date.toLocaleString("en-US", { ...options, timeZone: "UTC" })} UTC`;

  return (
    <time dateTime={date.toISOString()} className={className} title={date.toISOString()}>
      {text}
    </time>
  );
}
