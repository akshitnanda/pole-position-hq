import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Pole Position HQ";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 12% 10%, rgba(225, 6, 0, 0.26), transparent 28%), radial-gradient(circle at 78% 16%, rgba(0, 161, 155, 0.18), transparent 24%), linear-gradient(180deg, #f9fafc 0%, #eef2f6 100%)",
          color: "#11151d",
          padding: "56px",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            fontSize: 18,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(17, 21, 29, 0.66)",
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#e10600",
            }}
          />
          Pole Position HQ
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              lineHeight: 0.95,
              letterSpacing: "-0.06em",
              fontWeight: 700,
              maxWidth: 880,
            }}
          >
            Broadcast-grade F1 telemetry, timing, and fantasy intelligence.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.4,
              color: "rgba(17, 21, 29, 0.72)",
              maxWidth: 840,
            }}
          >
            A premium command surface built on OpenF1, F1 GraphQL, and resilient
            demo-first data fallbacks.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {["Telemetry scrub", "Track map sync", "Stable live demo"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                borderRadius: 999,
                border: "1px solid rgba(17, 21, 29, 0.08)",
                background: "rgba(255, 255, 255, 0.7)",
                padding: "12px 18px",
                fontSize: 22,
                color: "rgba(17, 21, 29, 0.74)",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
