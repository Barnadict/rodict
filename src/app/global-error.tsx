"use client";

// Root-layout crash fallback (Task #36) — only fires if the layout itself
// throws (theme provider, sidebar, etc.), which normal error.tsx can't catch
// since it doesn't wrap the layout. Must define its own <html>/<body> and
// re-import global styles, since it replaces the root layout entirely — it
// can't assume next-themes ran, so it deliberately doesn't rely on dark-mode
// tokens and just uses plain, always-readable colors.
import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white p-6 text-neutral-900">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-neutral-600">
            The app hit an unexpected error and couldn&apos;t recover on its own.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
