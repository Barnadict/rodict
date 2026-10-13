import { cn } from "@/lib/utils";

/**
 * The mark: a red tile holding a three-row rundown, the longest bar on top.
 * The same drawing is in `src/app/icon.svg` and `public/rodictLogo.svg`.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 140"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
    >
      <rect width="140" height="140" rx="22" fill="var(--brand)" />
      <rect x="28" y="32" width="84" height="20" rx="3" fill="#fff" />
      <rect x="28" y="60" width="58" height="20" rx="3" fill="#fff" />
      <rect x="28" y="88" width="34" height="20" rx="3" fill="#fff" />
    </svg>
  );
}

/** The two-tone wordmark: "ro" in the logo red, "dict" in the ink. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-2xl leading-none font-black tracking-[-0.02em] font-stretch-[80%]",
        className,
      )}
    >
      <span className="text-brand">ro</span>
      <span className="text-brand-ink">dict</span>
    </span>
  );
}

/** Mark and wordmark together. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <Wordmark />
    </span>
  );
}
