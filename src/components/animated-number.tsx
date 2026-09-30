"use client";

import * as React from "react";

/**
 * A number that counts up once when it first scrolls into view (Task #105).
 * The server renders the final value, so the static shell and no-JS readers
 * see the real figure; under prefers-reduced-motion it never animates.
 */
export function AnimatedNumber({
  value,
  durationMs = 1200,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const format = React.useCallback((n: number) => Math.round(n).toLocaleString("en-US"), []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const run = () => {
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = format(value * eased);
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        run();
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [value, durationMs, format]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true">
        {format(value)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
