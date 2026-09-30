import { ImageResponse } from "next/og";

/**
 * Open Graph share images (Task #72), rendered with `next/og`.
 *
 * One layout for every route so shared links look like one site: brand mark,
 * a kicker ("Game", "Genre"), the title, a subtitle, and up to three stats.
 * Satori (the renderer) needs `display: flex` on any element with more than one
 * child, and supports only inline styles, hence the verbose style objects.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BRAND_RED = "#e2231a";
const BG = "#0b0b0f";
const FG = "#f5f5f7";
const MUTED = "#a1a1aa";

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
        padding: 64,
        background: BG,
        color: FG,
        borderTop: `12px solid ${BRAND_RED}`,
      }}
    >
      {/* Brand mark: the same three rising bars as the sidebar logo. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            width: 56,
            height: 56,
            padding: "12px 12px",
            borderRadius: 12,
            background: BRAND_RED,
          }}
        >
          <div style={{ width: 8, height: 14, background: "#fff", borderRadius: 2 }} />
          <div style={{ width: 8, height: 22, background: "#fff", borderRadius: 2 }} />
          <div style={{ width: 8, height: 32, background: "#fff", borderRadius: 2 }} />
        </div>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700 }}>
          <span style={{ color: BRAND_RED }}>ro</span>
          <span>dict</span>
        </div>
        {kicker ? (
          <div
            style={{
              display: "flex",
              marginLeft: 12,
              padding: "6px 16px",
              borderRadius: 999,
              border: `2px solid ${MUTED}`,
              color: MUTED,
              fontSize: 24,
            }}
          >
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
            style={{ borderRadius: 28, flexShrink: 0 }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize(safeTitle),
              fontWeight: 700,
              lineHeight: 1.1,
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

      <div style={{ display: "flex", gap: 64 }}>
        {stats.slice(0, 3).map((s) => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{s.label}</div>
            <div style={{ display: "flex", fontSize: 48, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>,
    OG_SIZE,
  );
}
