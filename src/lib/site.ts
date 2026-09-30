/**
 * The site's canonical origin (Task #72), for URLs that must be absolute:
 * `metadataBase` (Open Graph images, canonicals), the sitemap and robots.txt.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set (e.g. a custom domain later). On Vercel,
 * `VERCEL_PROJECT_PRODUCTION_URL` is the production domain even in preview
 * builds, so previews never advertise themselves as canonical. The last resort
 * is the known production URL rather than localhost, so a misconfigured deploy
 * still emits correct links.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://rodict.vercel.app";
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = "rodict";

/**
 * Title, description, canonical and Open Graph fields for a page. A page's
 * `openGraph` replaces the root layout's wholesale, so the shared fields are
 * repeated here rather than inherited.
 */
export function pageMetadata(opts: { title: string; description: string; path: string }) {
  const { title, description, path } = opts;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type: "website" as const },
  };
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}
