import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config";

export const runtime = "edge";
export const alt = SITE.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #0b2c1e 0%, #072016 100%)",
          color: "#f6f3ea",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 10, textTransform: "uppercase", opacity: 0.7 }}>
          {SITE.name}
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 24, lineHeight: 1.05, maxWidth: 900 }}>
          Torneo de hockey mixto
        </div>
        <div style={{ fontSize: 34, marginTop: 24, color: "#c1cfc4" }}>
          64 equipos · un día · cuatro copas
        </div>
      </div>
    ),
    size,
  );
}
