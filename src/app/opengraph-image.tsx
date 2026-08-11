import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ïora — AI Ads & Websites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reused directly from LogoMark.tsx / Footer.tsx's own "variant A" mark —
// same path data, so the share card carries the exact same wordmark shape
// as the live site rather than a redrawn approximation.
const MARK_VIEWBOX = "6 52 1374 516";
const MARK_PATHS = [
  "M64 184 H152 Q156 184 156 188 V564 Q156 568 152 568 H64 Q60 568 60 564 V188 Q60 184 64 184 Z",
  "M324 184 H564 A80 80 0 0 1 644 264 V488 A80 80 0 0 1 564 568 H324 A80 80 0 0 1 244 488 V264 A80 80 0 0 1 324 184 Z M368 272 H520 A36 36 0 0 1 556 308 V440 A36 36 0 0 1 520 476 H368 A36 36 0 0 1 332 440 V308 A36 36 0 0 1 368 272 Z",
  "M980 184 H812 A92 92 0 0 0 720 276 V568 H800 V312 A48 48 0 0 1 848 264 H984 V184 Z",
  "M1040 184 H1316 A64 64 0 0 1 1380 248 V568 H1056 A60 60 0 0 1 996 508 V384 A60 60 0 0 1 1056 324 H1288 V264 A16 16 0 0 0 1272 248 H1036 V188 Q1036 184 1040 184 Z M1104 400 H1288 V480 H1092 A8 8 0 0 1 1084 472 V428 A28 28 0 0 1 1104 400 Z",
];
const MARK_DOTS = [
  "M12 52 H88 Q94 52 94 58 V130 Q94 136 88 136 H12 Q6 136 6 130 V58 Q6 52 12 52 Z",
  "M132 52 H208 Q214 52 214 58 V130 Q214 136 208 136 H132 Q126 136 126 130 V58 Q126 52 132 52 Z",
];

export default async function Image() {
  const [geistRegular, geistBold] = await Promise.all([
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b0c10",
          position: "relative",
        }}
      >
        {/* Ambient accent glow — same radial-gradient-as-glow technique
            used for ImpactSection's own marble condense, not a blur
            filter (Satori has no filter support anyway). */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -180,
            width: 640,
            height: 640,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,78,50,0.55) 0%, rgba(255,78,50,0.18) 35%, rgba(255,78,50,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -220,
            left: -160,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(244,244,242,0.06) 0%, rgba(244,244,242,0) 70%)",
            display: "flex",
          }}
        />

        {/* Signature wordmark, top-left — small, not dominant, matching
            how the real site treats it (a signature, not the headline). */}
        <div style={{ position: "absolute", top: 64, left: 72, display: "flex" }}>
          <svg width={168} height={63} viewBox={MARK_VIEWBOX} fill="#ff4e32">
            <g fillRule="evenodd">
              {MARK_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            {MARK_DOTS.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </div>

        {/* The core statement — Hero's own headline, "the noise." carrying
            the same accent treatment it does live. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            padding: "0 100px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              fontFamily: "Geist",
              fontWeight: 700,
              fontSize: 76,
              lineHeight: 1.08,
              color: "#f4f4f2",
              letterSpacing: "-0.02em",
            }}
          >
            We break through&nbsp;<span style={{ color: "#ff4e32", display: "flex" }}>the noise.</span>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist",
              fontWeight: 400,
              fontSize: 30,
              color: "rgba(244,244,242,0.55)",
              letterSpacing: "0.02em",
            }}
          >
            AI Ads &amp; Websites
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: geistRegular, style: "normal", weight: 400 },
        { name: "Geist", data: geistBold, style: "normal", weight: 700 },
      ],
    },
  );
}
