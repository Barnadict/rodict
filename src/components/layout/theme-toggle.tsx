"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const noopSubscribe = () => () => {};

/**
 * A sliding switch: the knob sits left on the sun in the light theme and right
 * on the moon in the dark one. Position and icon follow the `.dark` class in
 * CSS, so the first paint is already correct; only `aria-checked` waits for
 * mount.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative inline-flex h-7 w-13 shrink-0 cursor-pointer items-center justify-between rounded-full border border-input bg-muted px-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sun aria-hidden className="size-3.5" />
      <Moon aria-hidden className="size-3.5" />
      <span className="absolute top-0.5 left-0.5 flex size-5.5 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform duration-200 ease-out in-[.dark]:translate-x-6 motion-reduce:transition-none">
        <Sun
          aria-hidden
          className="absolute size-3.5 transition-opacity duration-200 in-[.dark]:opacity-0 motion-reduce:transition-none"
        />
        <Moon
          aria-hidden
          className="absolute size-3.5 opacity-0 transition-opacity duration-200 in-[.dark]:opacity-100 motion-reduce:transition-none"
        />
      </span>
    </button>
  );
}
