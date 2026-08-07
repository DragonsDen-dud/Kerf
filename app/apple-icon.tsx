import { ImageResponse } from "next/og";

/**
 * The iOS home-screen icon. Generated at build time rather than committed as a
 * binary, so the repo stays text-only and the icon can never drift from the
 * SVG the rest of the app uses.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 12,
          padding: 22,
          background: "#0b1220",
        }}
      >
        {/* A stock bar cut into three coloured pieces, with the offcut left dark. */}
        <div style={{ display: "flex", height: 34, gap: 4 }}>
          <div style={{ width: 52, background: "#2563eb", borderRadius: 5 }} />
          <div style={{ width: 36, background: "#16a34a", borderRadius: 5 }} />
          <div style={{ width: 22, background: "#db2777", borderRadius: 5 }} />
          <div style={{ flex: 1, background: "#1f2b40", borderRadius: 5 }} />
        </div>
        <div style={{ display: "flex", height: 14, background: "#f59e0b", borderRadius: 7, width: 96 }} />
        <div style={{ display: "flex", height: 14, background: "#334155", borderRadius: 7, width: 64 }} />
      </div>
    ),
    size,
  );
}
