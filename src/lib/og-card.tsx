import { ImageResponse } from "next/og";

/**
 * Open Graph share images (Task #72), rendered with `next/og`.
 *
 * One layout for every route so shared links look like one site: the page band
 * from the site (near-black, blue edge), the mark and wordmark, what kind of
 * page it is, the title, a subtitle, and up to three stats on heavy rules.
 * Satori (the renderer) needs `display: flex` on any element with more than one
 * child, and supports only inline styles, hence the verbose style objects.
 * Colours are the dark-theme tokens from `globals.css`, written out because
 * Satori can't read CSS variables.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BAND = "#030916";
const FG = "#f5f8ff";
const MUTED = "#8ea0c8";
const RULE = "#33488a";
const PRIMARY = "#155dfc";
const BRAND = "#f0473c";
const BRAND_INK = "#e3ecff";

export interface OgStat {
  label: string;
  value: string;
}

export interface OgCardProps {
  kicker?: string;
  title: string;
  subtitle?: string | null;
  stats?: OgStat[];
  /** Absolute image URL (e.g. a game icon), drawn beside the title. */
  imageUrl?: string | null;
}

/** Long titles shrink so they fit on two lines instead of overflowing. */
function titleSize(title: string): number {
  if (title.length <= 24) return 76;
  if (title.length <= 44) return 60;
  return 48;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function renderOgCard({ kicker, title, subtitle, stats = [], imageUrl }: OgCardProps) {
  const safeTitle = truncate(title, 80);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px 56px 84px",
        background: BAND,
        color: FG,
        borderLeft: `20px solid ${PRIMARY}`,
      }}
    >
      {/* The mark: the same three-row rundown as `components/logo.tsx`. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 5,
            width: 56,
            height: 56,
            padding: "0 11px",
            borderRadius: 9,
            background: BRAND,
          }}
        >
          <div style={{ width: 34, height: 8, background: "#fff", borderRadius: 1 }} />
          <div style={{ width: 23, height: 8, background: "#fff", borderRadius: 1 }} />
          <div style={{ width: 14, height: 8, background: "#fff", borderRadius: 1 }} />
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          <span style={{ color: BRAND }}>ro</span>
          <span style={{ color: BRAND_INK }}>dict</span>
        </div>
        {kicker ? (
          <div style={{ display: "flex", marginLeft: 14, color: MUTED, fontSize: 28 }}>
            {kicker}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- rendered by Satori, not the browser
          <img
            src={imageUrl}
            width={180}
            height={180}
            alt=""
            style={{ borderRadius: 12, flexShrink: 0 }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize(safeTitle),
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              textTransform: "uppercase",
            }}
          >
            {safeTitle}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 30, color: MUTED, lineHeight: 1.3 }}>
              {truncate(subtitle, 110)}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        {stats.slice(0, 3).map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              flex: 1,
              paddingTop: 14,
              borderTop: `3px solid ${RULE}`,
            }}
          >
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{s.label}</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>,
    OG_SIZE,
  );
}
